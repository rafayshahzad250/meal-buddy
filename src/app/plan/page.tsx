"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import LoginGate from "@/components/loginGate";
import { supabase } from "@/library/supabaseClient";
import { useSession } from "@/hooks/useSession";

/* ---------- date helpers (Mon-start week) ---------- */
function startOfWeekMonday(d: Date) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
}
function ymd(d: Date) {
    return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function addWeeks(d: Date, w: number) {
    return addDays(d, w * 7);
}

/* ---------- types ---------- */
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

type MealPlan = { id: string; week_start: string; user_id: string };
type PlanItem = {
    id: string;
    meal_plan_id: string;
    day: number; // 0..6 (Mon..Sun)
    meal_type: MealType;
    recipe_id: string | null;
    notes: string | null;
};
type RecipeLite = { id: string; title: string };
type RecipeWithIngs = { id: string; title: string; ingredients: string[] | null };

/* ---------- grocery helpers ---------- */
function dedupeIngredients(lines: string[]) {
    const map = new Map<string, string>();
    for (const l of lines) {
        const key = l.trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, l.trim());
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

/* ---------- ensure profile exists for FK ---------- */
async function ensureUserProfile(user: {
    id: string;
    email?: string | null;
    user_metadata?: any;
}) {
    const payload = {
        id: user.id,
        email: user.email ?? null,
        name:
            (user.user_metadata?.name as string | undefined) ??
            (user.user_metadata?.full_name as string | undefined) ??
            null,
    };
    await supabase.from("users").upsert(payload);
}

/* ---------- style map for meal chips ---------- */
const MEAL_STYLES: Record<MealType, { chip: string; badgeText: string }> = {
    breakfast: {
        chip: "bg-amber-50 border-amber-200 text-amber-900",
        badgeText: "Breakfast",
    },
    lunch: {
        chip: "bg-emerald-50 border-emerald-200 text-emerald-900",
        badgeText: "Lunch",
    },
    dinner: {
        chip: "bg-indigo-50 border-indigo-200 text-indigo-900",
        badgeText: "Dinner",
    },
    snack: {
        chip: "bg-pink-50 border-pink-200 text-pink-900",
        badgeText: "Snack",
    },
};

/* ---------- recipe picker modal ---------- */
function RecipePicker({
    open,
    ownerId,
    onSelect,
    onClose,
}: {
    open: boolean;
    ownerId: string;
    onSelect: (recipe: RecipeLite) => void;
    onClose: () => void;
}) {
    const [recipes, setRecipes] = useState<RecipeLite[]>([]);
    const [query, setQuery] = useState("");
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        (async () => {
            setErr(null);
            const { data, error } = await supabase
                .from("recipes")
                .select("id,title,created_at")
                .eq("owner_id", ownerId)
                .order("created_at", { ascending: false });
            if (error) setErr(error.message);
            else setRecipes((data ?? []).map((r) => ({ id: r.id, title: r.title })));
        })();
    }, [open, ownerId]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
    }, [recipes, query]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-token bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-token px-5 py-3">
                    <h3 className="text-lg font-semibold">Pick a recipe</h3>
                    <button className="btn-outline px-3 py-1.5 text-sm" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="p-5">
                    {err && (
                        <div className="mb-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                            {err}
                        </div>
                    )}
                    <input
                        className="input mb-4 w-full"
                        placeholder="Search recipes…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((r) => (
                            <button
                                key={r.id}
                                className="rounded-xl border border-token px-4 py-3 text-left transition hover:shadow-sm"
                                onClick={() => onSelect(r)}
                            >
                                <div className="font-medium line-clamp-2">{r.title}</div>
                            </button>
                        ))}
                    </div>

                    {filtered.length === 0 && (
                        <p className="muted mt-2 text-sm">No recipes found. Add some first.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- page ---------- */
export default function PlanPage() {
    const session = useSession();

    const [anchorDate, setAnchorDate] = useState(() => startOfWeekMonday(new Date()));
    const weekStart = useMemo(() => startOfWeekMonday(anchorDate), [anchorDate]);
    const weekStartYMD = useMemo(() => ymd(weekStart), [weekStart]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

    const [plan, setPlan] = useState<MealPlan | null>(null);
    const [items, setItems] = useState<PlanItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalErr, setGlobalErr] = useState<string | null>(null);

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ day: number; meal: MealType } | null>(null);

    // groceries
    const [showGroceries, setShowGroceries] = useState(false);
    const [groceryItems, setGroceryItems] = useState<string[]>([]);
    const [checked, setChecked] = useState<Set<string>>(new Set());

    // ---------- sticky header gap fix ----------
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [stickyTop, setStickyTop] = useState(72); // fallback

    useLayoutEffect(() => {
        const recalc = () => {
            if (!wrapperRef.current) return;
            const r = wrapperRef.current.getBoundingClientRect();
            // distance from viewport top to wrapper + small breathing room
            setStickyTop(Math.max(0, Math.round(r.top) + 8));
        };
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, []);
    // -------------------------------------------

    async function fetchItemsFor(planId: string) {
        const { data, error } = await supabase
            .from("plan_items")
            .select("id, meal_plan_id, day, meal_type, recipe_id, notes")
            .eq("meal_plan_id", planId)
            .order("day", { ascending: true });
        if (error) throw new Error(error.message);
        setItems(data ?? []);
    }

    useEffect(() => {
        if (!session?.user?.id) return;
        (async () => {
            setLoading(true);
            setGlobalErr(null);
            try {
                await ensureUserProfile({
                    id: session.user.id,
                    email: session.user.email ?? null,
                    user_metadata: session.user.user_metadata ?? {},
                });

                const { data: existing, error: selErr } = await supabase
                    .from("meal_plans")
                    .select("id, week_start, user_id")
                    .eq("user_id", session.user.id)
                    .eq("week_start", weekStartYMD)
                    .maybeSingle();
                if (selErr) throw new Error(selErr.message);

                let planRow: MealPlan | null = existing ?? null;
                if (!planRow) {
                    const { data, error } = await supabase
                        .from("meal_plans")
                        .insert({ user_id: session.user.id, week_start: weekStartYMD })
                        .select("id, week_start, user_id")
                        .single();
                    if (error) throw new Error(error.message);
                    planRow = data as MealPlan;
                }

                setPlan(planRow);
                await fetchItemsFor(planRow.id);

                setShowGroceries(false);
                setChecked(new Set());
                setGroceryItems([]);
            } catch (e: any) {
                setGlobalErr(e.message ?? "Failed to load plan.");
            } finally {
                setLoading(false);
            }
        })();
    }, [session?.user?.id, weekStartYMD]);

    async function addRecipeToCell(recipe: RecipeLite, day: number, meal: MealType) {
        if (!plan) return;
        setGlobalErr(null);
        try {
            const { error } = await supabase.from("plan_items").insert({
                meal_plan_id: plan.id,
                day,
                meal_type: meal,
                recipe_id: recipe.id,
                notes: null,
            });
            if (error) throw new Error(error.message);
            await fetchItemsFor(plan.id);
        } catch (e: any) {
            setGlobalErr(e.message ?? "Failed to add recipe.");
        }
    }

    async function removeItem(id: string) {
        if (!plan) return;
        try {
            const { error } = await supabase.from("plan_items").delete().eq("id", id);
            if (error) throw new Error(error.message);
            await fetchItemsFor(plan.id);
        } catch (e: any) {
            setGlobalErr(e.message ?? "Failed to remove item.");
        }
    }

    async function clearCell(day: number, meal: MealType) {
        if (!plan) return;
        const ok = confirm(`Clear all items for ${meal} on ${ymd(weekDays[day])}?`);
        if (!ok) return;
        try {
            const { error } = await supabase
                .from("plan_items")
                .delete()
                .eq("meal_plan_id", plan.id)
                .eq("day", day)
                .eq("meal_type", meal);
            if (error) throw new Error(error.message);
            await fetchItemsFor(plan.id);
        } catch (e: any) {
            setGlobalErr(e.message ?? "Failed to clear cell.");
        }
    }

    async function clearWeek() {
        if (!plan) return;
        const ok = confirm("Clear the whole week?");
        if (!ok) return;
        try {
            const { error } = await supabase.from("plan_items").delete().eq("meal_plan_id", plan.id);
            if (error) throw new Error(error.message);
            await fetchItemsFor(plan.id);
        } catch (e: any) {
            setGlobalErr(e.message ?? "Failed to clear week.");
        }
    }

    // title map for display
    const [recipeTitleMap, setRecipeTitleMap] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const ids = Array.from(new Set(items.map((i) => i.recipe_id).filter(Boolean))) as string[];
        if (!ids.length) return;
        (async () => {
            const { data, error } = await supabase.from("recipes").select("id,title").in("id", ids);
            if (error) return;
            const map = new Map(recipeTitleMap);
            (data ?? []).forEach((r) => map.set(r.id, r.title));
            setRecipeTitleMap(map);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    // groceries
    async function openGroceryList() {
        if (!plan) return;
        const recipeIds = Array.from(new Set(items.map((i) => i.recipe_id).filter(Boolean))) as string[];
        if (!recipeIds.length) {
            setGroceryItems([]);
            setChecked(new Set());
            setShowGroceries(true);
            return;
        }
        const { data, error } = await supabase
            .from("recipes")
            .select("id,title,ingredients")
            .in("id", recipeIds);
        if (error) {
            setGlobalErr(error.message);
            return;
        }
        const allLines: string[] = [];
        (data as RecipeWithIngs[] | null)?.forEach((r) =>
            (r.ingredients ?? []).forEach((l) => allLines.push(l))
        );
        setGroceryItems(dedupeIngredients(allLines));
        setChecked(new Set());
        setShowGroceries(true);
    }
    function toggleChecked(item: string) {
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(item) ? next.delete(item) : next.add(item);
            return next;
        });
    }

    return (
        <LoginGate>
            <main className="container-page">
                {globalErr && (
                    <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {globalErr}
                    </div>
                )}

                {/* controls */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <button className="btn-outline" onClick={() => setAnchorDate((d) => addWeeks(d, -1))}>
                        ← Previous
                    </button>

                    <div className="text-center">
                        <h1 className="text-3xl font-bold tracking-tight">Weekly plan</h1>
                        <p className="muted text-sm">
                            {ymd(weekDays[0])} – {ymd(weekDays[6])}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="btn-outline" onClick={() => setAnchorDate((d) => addWeeks(d, 1))}>
                            Next →
                        </button>
                        <button className="btn-outline" onClick={clearWeek}>
                            Clear week
                        </button>
                        <button className="btn" onClick={openGroceryList}>
                            Grocery list
                        </button>
                    </div>
                </div>

                {/* grid (white-gap fix applied) */}
                <div
                    ref={wrapperRef}
                    className="overflow-x-auto rounded-2xl border border-token bg-white"
                    style={{ paddingTop: stickyTop }}
                >
                    <table className="w-full text-sm" style={{ marginTop: -stickyTop }}>
                        {/* sticky day headers */}
                        <thead className="bg-[oklch(var(--muted))]">

                            <tr className="text-sm">
                                <th className="p-3 text-left font-semibold bg-[oklch(var(--muted))] sticky left-0 z-20">
                                    Meal
                                </th>
                                {weekDays.map((d, i) => (
                                    <th key={i} className="p-3 text-left">
                                        <div className="text-[13px] uppercase tracking-wide text-zinc-600">
                                            {d.toLocaleDateString(undefined, { weekday: "short" })}
                                        </div>
                                        <div className="mt-0.5 inline-block rounded-full border border-token bg-white px-2 py-0.5 text-[12px]">
                                            {ymd(d)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {MEAL_TYPES.map((meal, mealIdx) => (
                                <tr key={meal} className="border-t border-token">
                                    {/* sticky meal chip */}
                                    <td className="p-3 bg-[oklch(var(--muted))] sticky left-0 z-10">
                                        <span
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${MEAL_STYLES[meal].chip}`}
                                        >
                                            {MEAL_STYLES[meal].badgeText}
                                        </span>
                                    </td>

                                    {weekDays.map((_d, dayIndex) => {
                                        const cellItems = items.filter(
                                            (it) => it.day === dayIndex && it.meal_type === meal
                                        );
                                        const hasItems = cellItems.length > 0;

                                        return (
                                            <td
                                                key={dayIndex}
                                                className={`p-3 align-top ${mealIdx === 0 ? "pt-6 sm:pt-8" : ""}`}
                                            >
                                                <div className="flex min-h-[116px] flex-col gap-2">
                                                    {/* vertical chips */}
                                                    {cellItems.map((it) => (
                                                        <div key={it.id} className="rounded-2xl border border-token p-3">
                                                            <div className="text-sm font-medium leading-snug line-clamp-3">
                                                                {it.recipe_id
                                                                    ? recipeTitleMap.get(it.recipe_id) ?? "Recipe"
                                                                    : it.notes ?? "Item"}
                                                            </div>
                                                            <button
                                                                className="btn-outline w-full mt-2 text-xs"
                                                                onClick={() => removeItem(it.id)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}

                                                    {/* actions */}
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                        <button
                                                            className="btn-outline text-xs"
                                                            onClick={() => {
                                                                setPickerTarget({ day: dayIndex, meal });
                                                                setPickerOpen(true);
                                                            }}
                                                        >
                                                            + Add
                                                        </button>
                                                        {hasItems && (
                                                            <button
                                                                className="text-xs btn-outline"
                                                                onClick={() => clearCell(dayIndex, meal)}
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {loading && <p className="muted mt-4 text-sm">Loading your plan…</p>}
            </main>

            {/* recipe picker */}
            {pickerOpen && pickerTarget && session?.user?.id && (
                <RecipePicker
                    open={pickerOpen}
                    ownerId={session.user.id}
                    onClose={() => setPickerOpen(false)}
                    onSelect={(r) => {
                        addRecipeToCell(r, pickerTarget.day, pickerTarget.meal);
                        setPickerOpen(false);
                    }}
                />
            )}

            {/* grocery list drawer */}
            {showGroceries && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="flex-1 bg-black/30" onClick={() => setShowGroceries(false)} />
                    <div className="w-full max-w-md bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-token p-4">
                            <h3 className="font-semibold">Grocery list</h3>
                            <button
                                className="btn-outline px-2 py-1 text-sm"
                                onClick={() => setShowGroceries(false)}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-4">
                            {groceryItems.length === 0 ? (
                                <p className="muted text-sm">No ingredients found for this week.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {groceryItems.map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                            <input
                                                type="checkbox"
                                                className="mt-1"
                                                checked={checked.has(item)}
                                                onChange={() => toggleChecked(item)}
                                            />
                                            <span className={checked.has(item) ? "line-through text-zinc-400" : ""}>
                                                {item}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </LoginGate>
    );
}
