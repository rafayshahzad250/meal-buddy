"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LoginGate from "@/components/loginGate";
import { supabase } from "@/library/supabaseClient";
import { useSession } from "@/hooks/useSession";

const BUCKET = "recipe-images";

const splitTags = (s: string) => s.split(",").map(t => t.trim()).filter(Boolean);
const splitLinks = (s: string) => s.split(/[\n,]/).map(t => t.trim()).filter(Boolean);

export default function EditRecipePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const session = useSession();

    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [time, setTime] = useState<number | "">("");
    const [tags, setTags] = useState("");
    const [links, setLinks] = useState("");

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imagePath, setImagePath] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [removePhoto, setRemovePhoto] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);

            // Using "*": simpler TS life
            const { data, error } = await supabase
                .from("recipes")
                .select("*")
                .eq("id", id)
                .single();

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }

            setTitle(data.title ?? "");
            setDesc(data.description ?? "");
            setTime(data.cook_time_min ?? "");
            setTags((data.tags ?? []).join(", "));
            setLinks((data.source_urls ?? []).join("\n"));
            setImagePath(data.image_path ?? null);

            if (data.image_path) {
                const { data: signed, error: signErr } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrl(data.image_path, 60 * 60);
                if (!signErr && signed?.signedUrl) {
                    setImageUrl(signed.signedUrl);
                } else {
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.image_path);
                    setImageUrl(pub?.publicUrl ?? data.image_url ?? null);
                }
            } else {
                setImageUrl(null);
            }

            setLoading(false);
        })();
    }, [id]);

    function handleRemovePhoto() {
        setRemovePhoto(true);
        setFile(null);
        setImageUrl(null);
    }

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

        let uploadedNewPath: string | null = null;
        let uploadedNewUrl: string | null = null;

        try {
            if (file && session?.user?.id) {
                const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                const newPath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
                const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file);
                if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);

                const { data: signed, error: signErr } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrl(newPath, 60 * 60);
                uploadedNewUrl = !signErr && signed?.signedUrl
                    ? signed.signedUrl
                    : supabase.storage.from(BUCKET).getPublicUrl(newPath).data?.publicUrl ?? null;

                uploadedNewPath = newPath;
            }

            const payload: any = {
                title: title.trim(),
                description: desc.trim() || null,
                cook_time_min: time === "" ? null : Number(time),
                tags: tagArray.length ? tagArray : null,
                source_urls: urlArray.length ? urlArray : null,
            };

            if (uploadedNewPath) {
                payload.image_path = uploadedNewPath;
                payload.image_url = uploadedNewUrl;
            } else if (removePhoto) {
                payload.image_path = null;
                payload.image_url = null;
            }

            const { error: updateErr } = await supabase.from("recipes").update(payload).eq("id", id);
            if (updateErr) throw new Error(updateErr.message);

            if (uploadedNewPath && imagePath) {
                await supabase.storage.from(BUCKET).remove([imagePath]);
            }
            if (removePhoto && imagePath) {
                await supabase.storage.from(BUCKET).remove([imagePath]);
            }

            router.push(`/recipes/${id}`);
        } catch (err: any) {
            if (uploadedNewPath) {
                await supabase.storage.from(BUCKET).remove([uploadedNewPath]);
            }
            setError(err.message ?? "Something went wrong.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <LoginGate>
                <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
                    <div className="w-full max-w-xl">
                        <div className="h-6 w-40 animate-pulse rounded surface-muted" />
                        <div className="mt-6 h-64 w-full animate-pulse rounded-2xl surface-muted" />
                    </div>
                </main>
            </LoginGate>
        );
    }

    return (
        <LoginGate>
            <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
                <div className="w-full max-w-xl">
                    <h1 className="mb-6 text-center text-3xl font-bold">Edit recipe</h1>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form onSubmit={onSubmit} className="space-y-6">
                        {/* Title */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Title *</label>
                            <input
                                className="input w-full"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Description</label>
                            <textarea
                                className="textarea w-full"
                                rows={4}
                                value={desc}
                                onChange={(e) => setDesc(e.target.value)}
                            />
                        </div>

                        {/* Time + Tags */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Cook time (min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="input w-full"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value === "" ? "" : Number(e.target.value))}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Tags</label>
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

                        {/* Links */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Source links</label>
                            <textarea
                                className="textarea w-full"
                                rows={3}
                                value={links}
                                onChange={(e) => setLinks(e.target.value)}
                                placeholder="One URL per line or comma-separated"
                            />
                        </div>

                        {/* Photo */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Photo</label>
                            <div className="flex items-start gap-4">
                                <div className="w-48">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="new preview" className="card aspect-[4/3] w-48 object-cover" />
                                    ) : imageUrl ? (
                                        <img src={imageUrl} alt="current" className="card aspect-[4/3] w-48 object-cover" />
                                    ) : (
                                        <div className="card aspect-[4/3] w-48 surface-muted" />
                                    )}
                                </div>

                                <div className="flex-1 space-y-2">
                                    {!removePhoto && imageUrl && !previewUrl ? (
                                        <button type="button" onClick={handleRemovePhoto} className="btn-outline">
                                            Remove current photo
                                        </button>
                                    ) : null}

                                    <div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                setFile(e.target.files?.[0] ?? null);
                                                setRemovePhoto(false);
                                            }}
                                            className="block"
                                        />
                                        <p className="muted mt-1 text-xs">JPG/PNG recommended.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
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
