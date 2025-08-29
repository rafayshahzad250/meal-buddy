"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import LoginGate from "@/components/loginGate";
import { supabase } from "@/library/supabaseClient";
import { useSession } from "@/hooks/useSession";

const BUCKET = "recipe-images";

type Recipe = {
    id: string;
    title: string;
    description: string | null;
    cook_time_min: number | null;
    tags: string[] | null;
    source_urls: string[] | null;
    image_url: string | null;
    image_path: string | null;
    owner_id: string | null;
    ingredients: string[] | null; // ✅ NEW
};

export default function RecipeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const session = useSession();

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Signed URL for image (refreshable later if you add ISR)
    const signedImageUrl = useMemo(() => recipe?.image_url ?? null, [recipe?.image_url]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErr(null);

            const { data, error } = await supabase
                .from("recipes")
                .select("*") // includes ingredients now
                .eq("id", id)
                .single();

            if (error) {
                setErr(error.message);
                setLoading(false);
                return;
            }

            // Prefer a fresh signed URL so detail page works with private buckets
            let imageUrl = (data as Recipe).image_url as string | null;
            if ((data as Recipe).image_path) {
                const { data: signed, error: signErr } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrl((data as Recipe).image_path as string, 60 * 60); // 1 hour
                if (!signErr && signed?.signedUrl) {
                    imageUrl = signed.signedUrl;
                } else {
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl((data as Recipe).image_path as string);
                    imageUrl = pub?.publicUrl ?? imageUrl;
                }
            }

            setRecipe({ ...(data as Recipe), image_url: imageUrl });
            setLoading(false);
        })();
    }, [id]);

    async function onDelete() {
        if (!recipe) return;
        const confirmed = confirm("Delete this recipe? This cannot be undone.");
        if (!confirmed) return;

        setDeleting(true);
        try {
            // Delete row first
            const { error: delErr } = await supabase.from("recipes").delete().eq("id", recipe.id);
            if (delErr) throw new Error(delErr.message);

            // Best-effort: delete storage file
            if (recipe.image_path) {
                await supabase.storage.from(BUCKET).remove([recipe.image_path]);
            }

            router.replace("/recipes");
        } catch (e: any) {
            alert(e.message ?? "Failed to delete");
            setDeleting(false);
        }
    }

    return (
        <LoginGate>
            {/* Center column */}
            <main className="px-4">
                {loading ? (
                    <div className="mx-auto max-w-3xl">
                        <div className="h-8 w-72 animate-pulse rounded surface-muted mx-auto mt-10" />
                        <div className="mt-6 aspect-[4/3] w-full animate-pulse rounded-2xl surface-muted" />
                        <div className="mt-6 h-4 w-1/2 animate-pulse rounded surface-muted" />
                        <div className="mt-2 h-4 w-1/3 animate-pulse rounded surface-muted" />
                    </div>
                ) : err ? (
                    <div className="mx-auto max-w-3xl">
                        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {err}
                        </p>
                        <div className="mt-4">
                            <Link className="btn-outline" href="/recipes">
                                Back to recipes
                            </Link>
                        </div>
                    </div>
                ) : !recipe ? (
                    <div className="mx-auto max-w-3xl">
                        <p className="muted">Recipe not found.</p>
                        <div className="mt-4">
                            <Link className="btn-outline" href="/recipes">
                                Back to recipes
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto max-w-3xl">
                        {/* Title */}
                        <h1 className="mt-4 text-center text-3xl font-bold tracking-tight">
                            {recipe.title}
                        </h1>

                        {/* Actions */}
                        <div className="mt-4 flex items-center justify-center gap-3">
                            <Link href={`/recipes/${recipe.id}/edit`} className="btn">
                                Edit
                            </Link>
                            {/* Only show Delete to owner (best-effort UI check) */}
                            {session?.user?.id === recipe.owner_id && (
                                <button onClick={onDelete} disabled={deleting} className="btn-outline">
                                    {deleting ? "Deleting…" : "Delete"}
                                </button>
                            )}
                            <Link href="/recipes" className="btn-outline">
                                Back
                            </Link>
                        </div>

                        {/* Image */}
                        <div className="mt-6 card overflow-hidden">
                            {signedImageUrl ? (
                                <img
                                    src={signedImageUrl}
                                    alt={recipe.title}
                                    className="aspect-[4/3] w-full object-cover"
                                />
                            ) : (
                                <div className="aspect-[4/3] w-full surface-muted" />
                            )}
                        </div>

                        {/* Meta */}
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                            {recipe.cook_time_min ? (
                                <span className="muted">{recipe.cook_time_min} min</span>
                            ) : null}
                            {recipe.tags?.map((t) => (
                                <span
                                    key={t}
                                    className="rounded-full border border-token px-2 py-0.5 text-xs"
                                >
                                    {t}
                                </span>
                            ))}
                        </div>

                        {/* Description */}
                        {recipe.description ? (
                            <div className="prose prose-zinc mx-auto mt-6 max-w-none">
                                <p>{recipe.description}</p>
                            </div>
                        ) : null}

                        {/* Ingredients */}
                        {recipe.ingredients && recipe.ingredients.length > 0 && (
                            <div className="mx-auto mt-6 max-w-2xl">
                                <h2 className="text-center text-sm font-semibold uppercase tracking-wide muted">
                                    Ingredients
                                </h2>
                                <ul className="mt-3 list-disc space-y-1 pl-6">
                                    {recipe.ingredients.map((line, i) => (
                                        <li key={i}>{line}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Links */}
                        {recipe.source_urls && recipe.source_urls.length > 0 ? (
                            <div className="mt-6">
                                <h2 className="text-center text-sm font-semibold uppercase tracking-wide muted">
                                    Source links
                                </h2>
                                <ul className="mt-2 space-y-2">
                                    {recipe.source_urls.map((u, i) => (
                                        <li key={i}>
                                            <a
                                                href={u}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="break-all"
                                            >
                                                {u}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                )}
            </main>
        </LoginGate>
    );
}
