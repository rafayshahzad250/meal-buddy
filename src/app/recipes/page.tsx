"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LoginGate from "@/components/loginGate";
import { supabase } from "@/library/supabaseClient";

type RecipeRow = {
    id: string;
    title: string;
    description: string | null;
    cook_time_min: number | null;
    tags: string[] | null;
    image_path: string | null; // path in storage bucket
};

type Recipe = RecipeRow & { imageUrl: string | null };

const BUCKET = "recipe-images";

export default function RecipesPage() {
    const [recipes, setRecipes] = useState<Recipe[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErr(null);

            const { data, error } = await supabase
                .from("recipes")
                .select("id,title,description,cook_time_min,tags,image_path")
                .order("created_at", { ascending: false });

            if (error) {
                setErr(error.message);
                setRecipes([]);
                setLoading(false);
                return;
            }

            const rows = data ?? [];

            // Batch signed URLs for any image paths (works for both public/private buckets)
            const paths = rows.map((r) => r.image_path).filter(Boolean) as string[];
            let signedMap = new Map<string, string>();

            if (paths.length > 0) {
                const { data: signed, error: signErr } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrls(paths, 60 * 60); // 1 hour

                if (!signErr && signed) {
                    signed.forEach((s) => {
                        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
                    });
                } else {
                    // Fallback to public URLs (in case bucket is public)
                    paths.forEach((p) => {
                        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(p);
                        if (pub?.publicUrl) signedMap.set(p, pub.publicUrl);
                    });
                }
            }

            const withUrls: Recipe[] = rows.map((r) => ({
                ...r,
                imageUrl: r.image_path ? signedMap.get(r.image_path) ?? null : null,
            }));

            setRecipes(withUrls);
            setLoading(false);
        })();
    }, []);

    return (
        <LoginGate>
            <main className="space-y-6">
                {/* Header row */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
                        <p className="muted text-sm">
                            Your saved meals, links, and quick ideas.
                        </p>
                    </div>
                    <Link href="/recipes/new" className="btn">
                        Add recipe
                    </Link>
                </div>

                {/* Error */}
                {err && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {err}
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="card">
                                <div className="aspect-[4/3] w-full animate-pulse bg-[oklch(var(--muted))]" />
                                <div className="space-y-2 p-4">
                                    <div className="h-4 w-2/3 animate-pulse rounded bg-[oklch(var(--muted))]" />
                                    <div className="h-3 w-4/5 animate-pulse rounded bg-[oklch(var(--muted))]" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && recipes && recipes.length === 0 && (
                    <div className="card p-8 text-center">
                        <p className="muted">
                            No recipes yet. Start by adding one!
                        </p>
                        <div className="mt-4">
                            <Link href="/recipes/new" className="btn">
                                Add your first recipe
                            </Link>
                        </div>
                    </div>
                )}

                {/* Grid */}
                {!loading && recipes && recipes.length > 0 && (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {recipes.map((r) => (
                            <Link
                                key={r.id}
                                href={`/recipes/${r.id}`}
                                className="card transition hover:shadow-sm"
                            >
                                {r.imageUrl ? (
                                    <img
                                        src={r.imageUrl}
                                        alt={r.title}
                                        className="aspect-[4/3] w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="aspect-[4/3] w-full bg-[oklch(var(--muted))]" />
                                )}

                                <div className="p-4">
                                    <h3 className="font-semibold line-clamp-1">{r.title}</h3>

                                    {r.description && (
                                        <p className="muted mt-1 line-clamp-2 text-sm">
                                            {r.description}
                                        </p>
                                    )}

                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                        {r.cook_time_min ? (
                                            <span className="muted">{r.cook_time_min} min</span>
                                        ) : null}
                                        {r.tags?.map((t) => (
                                            <span
                                                key={t}
                                                className="rounded-full border border-[oklch(var(--border))] px-2 py-0.5"
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </LoginGate>
    );
}
