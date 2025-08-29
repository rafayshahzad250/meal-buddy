"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/library/supabaseClient";
import LoginGate from "@/components/loginGate";
import { useSession } from "@/hooks/useSession";

const BUCKET = "recipe-images";

const splitTags = (s: string) => s.split(",").map(t => t.trim()).filter(Boolean);
const splitLinks = (s: string) => s.split(/[\n,]/).map(t => t.trim()).filter(Boolean);

export default function NewRecipePage() {
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [time, setTime] = useState<number | "">("");
    const [tags, setTags] = useState("");
    const [links, setLinks] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();
    const session = useSession();

    const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) {
            setError("Please enter a title.");
            return;
        }
        setError(null);
        setSaving(true);

        const tagArray = splitTags(tags).slice(0, 12);
        const urlArray = splitLinks(links).slice(0, 12);

        let imageUrl: string | null = null;
        let imagePath: string | null = null;

        try {
            if (file && session?.user?.id) {
                const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

                const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
                if (uploadErr) throw new Error(`Image upload failed: ${uploadErr.message}`);

                const { data: signed, error: signErr } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrl(path, 60 * 60);

                imageUrl = !signErr && signed?.signedUrl
                    ? signed.signedUrl
                    : supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null;

                imagePath = path;
            }

            const { error: insertErr } = await supabase.from("recipes").insert({
                owner_id: session?.user?.id ?? null,
                title: title.trim(),
                description: desc.trim() || null,
                cook_time_min: time === "" ? null : Number(time),
                tags: tagArray.length ? tagArray : null,
                source_urls: urlArray.length ? urlArray : null,
                image_url: imageUrl,
                image_path: imagePath,
            });

            if (insertErr) throw new Error(insertErr.message);

            router.push("/recipes");
        } catch (err: any) {
            setError(err.message ?? "Something went wrong.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <LoginGate>
            <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
                <div className="w-full max-w-xl">
                    <h1 className="mb-6 text-center text-3xl font-bold">Add a recipe</h1>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="space-y-6">
                        {/* title */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Title *</label>
                            <input
                                className="input w-full"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                placeholder="Chicken Tikka Wraps"
                            />
                        </div>

                        {/* description */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Description</label>
                            <textarea
                                className="textarea w-full"
                                rows={4}
                                value={desc}
                                onChange={(e) => setDesc(e.target.value)}
                                placeholder="Short note or steps you want to remember…"
                            />
                        </div>

                        {/* time + tags */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Cook time (min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="input w-full"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value === "" ? "" : Number(e.target.value))}
                                    placeholder="30"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Tags (comma-separated)</label>
                                <input
                                    className="input w-full"
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    placeholder="quick, gluten-free, dinner"
                                />
                                {tags && (
                                    <div className="muted text-xs">
                                        {splitTags(tags).map((t) => (
                                            <span key={t} className="mr-2 inline-block rounded-full border border-token px-2 py-0.5">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* links */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Source links</label>
                            <textarea
                                className="textarea w-full"
                                rows={3}
                                value={links}
                                onChange={(e) => setLinks(e.target.value)}
                                placeholder={`Paste TikTok/YouTube/blog URLs\nOne per line or comma-separated`}
                            />
                        </div>

                        {/* photo */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Photo</label>
                            <div className="flex items-start gap-4">
                                <div className="w-48">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="preview" className="card aspect-[4/3] w-48 object-cover" />
                                    ) : (
                                        <div className="card aspect-[4/3] w-48 surface-muted" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block" />
                                    <p className="muted text-xs">JPG/PNG recommended.</p>
                                </div>
                            </div>
                        </div>

                        {/* actions */}
                        <div className="flex items-center justify-center gap-3">
                            <button type="submit" disabled={saving} className="btn">
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => router.back()} className="btn-outline">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </LoginGate>
    );
}
