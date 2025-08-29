"use client";

import { useEffect, useMemo, useState } from "react";
import LoginGate from "@/components/loginGate";
import { supabase } from "@/library/supabaseClient";
import { useSession } from "@/hooks/useSession";

/* ============ time helpers (Mon-start weeks) ============ */
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

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

type MealPlan = { id: string; week_start: string; user_id: string };
type PlanItem = {
    id: string;
    meal_plan_id: string;
    day: number;            // 0..6 (Mon..Sun)
    meal_type: MealType;
    recipe_id: string | null;
    notes: string | null;
};
type RecipeLite = { id: string; title: string };
type RecipeWithIngs = { id: string; title: string; ingredients: string[] | null };

/* ============ grocery helpers ============ */
// dedupe case-insensitive, keep first-seen casing
function dedupeIngredients(lines: string[]) {
    const map = new Map<string, string>();
    for (const l of lines) {
        const key = l.trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, l.trim());
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

/* ============ Recipe Picker modal ============ */
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

    useEffect(() => {
        if (!open) return;
        (async () => {
            const { data, error } = await supabase
                .from("recipes")
                .select("id,title,created_at")
                .eq("owner_id", ownerId)
                .order("created_at", { ascending: false });
            if (!error) setRecipes((data ?? []).map(r => ({ id: r.id, title: r.title })));
        })();
    }, [open, ownerId]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? recipes.filter(r => r.title.toLowerCase().includes(q)) : recipes;
    }, [recipes, query]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="card w-full max-w-2xl">
                <div className="flex items-center justify-between border-b border-token px-5 py-3">
                    <h3 className="font-semibold">Pick a recipe</h3>
                    <button className="btn-outline px-2 py-1 text-sm" onClick={onClose}>Close</button>
                </div>

                <div className="p-5">
                    <input
                        className="input mb-4 w-full"
                        placeholder="Search recipes…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map(r => (
                            <button
                                key={r.id}
                                className="card text-left transition hover:shadow-sm p-3"
                                onClick={() => { onSelect(r); onClose(); }}
                            >
                                <div className="font-medium line-clamp-1">{r.title}</div>
                            </button>
                        ))}
                    </div>
                    {filtered.length === 0 && (
                        <p className="muted text-sm mt-2">No recipes found. Add some first.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ============ Main Page ============ */
export default function PlanPage() {
    const session = useSession();

    const [anchorDate, setAnchorDate] = useState(() => startOfWeekMonday(new Date()));
    const weekStart = useMemo(() => startOfWeekMonday(anchorDate), [anchorDate]);
    const weekStartYMD = useMemo(() => ymd(weekStart), [weekStart]);
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

    const [plan, setPlan] = useState<MealPlan | null>(null);
    const [items, setItems] = useState<PlanItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [picker, setPicker] = useState<{ open: boolean; day: number; meal: MealType } | null>(null);

    // grocery drawer state
    const [showGroceries, setShowGroceries] = useState(false);
    const [groceryItems, setGroceryItems] = useState<string[]>([]);
    const [checked, setChecked] = useState<Set<string>>(new Set());

    // Create/get the week's meal_plan and load its items
    useEffect(() => {
        if (!session?.user?.id) return;
        (async () => {
            setLoading(true);

            // Get or create meal_plan
            const { data: existing, error: selErr } = await supabase
                .from("meal_plans")
                .select("id, week_start, user_id")
                .eq("user_id", session.user.id)
                .eq("week_start", weekStartYMD)
                .maybeSingle();

            if (selErr) {
                setLoading(false);
                return;
            }

            let planRow: MealPlan | null = existing ?? null;
            if (!planRow) {
                const { data, error } = await supabase
                    .from("meal_plans")
                    .insert({ user_id: session.user.id, week_start: weekStartYMD })
                    .select("id, week_start, user_id")
                    .single();
                if (error) {
                    setLoading(false);
                    return;
                }
                planRow = data as MealPlan;
            }
            setPlan(planRow);

            // Fetch plan_items
            const { data: rows } = await supabase
                .from("plan_items")
                .select("id, meal_plan_id, day, meal_type, recipe_id, notes")
                .eq("meal_plan_id", planRow.id)
                .order("day", { ascending: true });

            setItems(rows ?? []);
            setLoading(false);

            // reset drawer when week changes
            setShowGroceries(false);
            setChecked(new Set());
            setGroceryItems([]);
        })();
    }, [session?.user?.id, weekStartYMD]);

    async function addRecipeToCell(recipe: RecipeLite, day: number, meal: MealType) {
        if (!plan) return;
        const { data, error } = await supabase
            .from("plan_items")
            .insert({
                meal_plan_id: plan.id,
                day,
                meal_type: meal,
                recipe_id: recipe.id,
                notes: null,
            })
            .select("*")
            .single();
        if (!error && data) setItems(prev => [...prev, data]);
    }

    async function removeItem(id: string) {
        const { error } = await supabase.from("plan_items").delete().eq("id", id);
        if (!error) setItems(prev => prev.filter(p => p.id !== id));
    }

    // tiny title map for display (optional but nice)
    const [recipeTitleMap, setRecipeTitleMap] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const ids = Array.from(new Set(items.map(i => i.recipe_id).filter(Boolean))) as string[];
        if (!ids.length) return;
        (async () => {
            const missing = ids.filter(id => !recipeTitleMap.has(id));
            if (!missing.length) return;
            const { data } = await supabase.from("recipes").select("id,title").in("id", missing);
            const map = new Map(recipeTitleMap);
            (data ?? []).forEach(r => map.set(r.id, r.title));
            setRecipeTitleMap(map);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    async function openGroceryList() {
        if (!plan) return;

        const recipeIds = Array.from(new Set(items.map(i => i.recipe_id).filter(Boolean))) as string[];
        if (!recipeIds.length) {
            setGroceryItems([]);
            setChecked(new Set());
            setShowGroceries(true);
            return;
        }

        const { data } = await supabase
            .from("recipes")
            .select("id,title,ingredients")
            .in("id", recipeIds);

        const allLines: string[] = [];
        (data as RecipeWithIngs[] | null)?.forEach(r => (r.ingredients ?? []).forEach(l => allLines.push(l)));
        const deduped = dedupeIngredients(allLines);

        setGroceryItems(deduped);
        setChecked(new Set());
        setShowGroceries(true);
    }

    function toggleChecked(item: string) {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(item) ? next.delete(item) : next.add(item);
            return next;
        });
    }

    return (
        <LoginGate>
            <main className="container-page">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <button className="btn-outline" onClick={() => setAnchorDate(d => addWeeks(d, -1))}>
                        ← Previous
                    </button>

                    <div className="text-center">
                        <h1 className="text-3xl font-bold tracking-tight">Weekly plan</h1>
                        <p className="muted text-sm">
                            {ymd(weekDays[0])} – {ymd(weekDays[6])}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="btn-outline" onClick={() => setAnchorDate(d => addWeeks(d, 1))}>
                            Next →
                        </button>
                        <button className="btn" onClick={openGroceryList}>
                            Grocery list
                        </button>
                    </div>
                </div>

                {/* Grid */}
                <div className="overflow-x-auto rounded-2xl border border-token bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-[oklch(var(--muted))]">
                            <tr>
                                <th className="p-3 text-left">Meal</th>
                                {weekDays.map((d, i) => (
                                    <th key={i} className="p-3 text-left">
                                        <div className="font-medium">
                                            {d.toLocaleDateString(undefined, { weekday: "short" })}
                                        </div>
                                        <div className="muted">{ymd(d)}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {MEAL_TYPES.map(meal => (
                                <tr key={meal} className="border-t border-token">
                                    <td className="p-3 font-medium capitalize">{meal}</td>
                                    {weekDays.map((_d, dayIndex) => {
                                        const cellItems = items.filter(it => it.day === dayIndex && it.meal_type === meal);
                                        return (
                                            <td key={dayIndex} className="p-3 align-top">
                                                <div className="flex flex-col gap-2">
                                                    {cellItems.map(it => (
                                                        <div
                                                            key={it.id}
                                                            className="flex items-center justify-between rounded-xl border border-token px-3 py-2"
                                                        >
                                                            <div className="line-clamp-1">
                                                                {it.recipe_id
                                                                    ? recipeTitleMap.get(it.recipe_id) ?? "Recipe"
                                                                    : it.notes ?? "Item"}
                                                            </div>
                                                            <button
                                                                className="text-xs btn-outline px-2 py-1"
                                                                onClick={() => removeItem(it.id)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}

                                                    <button
                                                        className="btn-outline text-xs"
                                                        onClick={() => setPicker({ open: true, day: dayIndex, meal })}
                                                    >
                                                        + Add
                                                    </button>
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

            {/* Recipe picker modal */}
            {picker && session?.user?.id && (
                <RecipePicker
                    open={picker.open}
                    ownerId={session.user.id}
                    onClose={() => setPicker(null)}
                    onSelect={(r) => addRecipeToCell(r, picker.day, picker.meal)}
                />
            )}

            {/* Grocery list drawer */}
            {showGroceries && (
                <div className="fixed inset-0 z-50 flex">
                    {/* backdrop */}
                    <div className="flex-1 bg-black/30" onClick={() => setShowGroceries(false)} />
                    {/* panel */}
                    <div className="w-full max-w-md bg-white shadow-xl">
                        <div className="border-b border-token p-4 flex items-center justify-between">
                            <h3 className="font-semibold">Grocery list</h3>
                            <button className="btn-outline px-2 py-1 text-sm" onClick={() => setShowGroceries(false)}>
                                Close
                            </button>
                        </div>
                        <div className="p-4">
                            {groceryItems.length === 0 ? (
                                <p className="muted text-sm">No ingredients found for this week.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {groceryItems.map(item => (
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
