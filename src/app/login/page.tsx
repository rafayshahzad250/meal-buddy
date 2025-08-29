"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/library/supabaseClient";
import { useSession } from "@/hooks/useSession";

export default function LoginPage() {
    const session = useSession();
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);

    // 1) Redirect immediately if already signed in
    useEffect(() => {
        if (session === undefined) return; // your hook still loading
        if (session) router.replace("/");
        else setShowForm(true); // not signed in -> show form
    }, [session, router]);

    // 2) Also listen for sign-in events triggered by the Auth UI (email/pass, OAuth, magic link)
    useEffect(() => {
        const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
            if (sess) router.replace("/");
        });
        return () => sub.subscription.unsubscribe();
    }, [router]);

    // Used by magic links / OAuth to return here after provider flow
    const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

    if (!showForm) {
        return (
            <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
                <div className="muted text-sm">Checking your session…</div>
            </main>
        );
    }

    return (
        <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
            <div className="card w-full max-w-md p-6">
                <h1 className="mb-4 text-center text-2xl font-bold">Sign in</h1>

                <Auth
                    supabaseClient={supabase}
                    view="sign_in"
                    redirectTo={redirectTo}
                    providers={[]}
                    appearance={{
                        theme: ThemeSupa,
                        className: {
                            container: "space-y-4",
                            label: "text-sm font-medium mb-1",
                            input:
                                "input w-full !rounded-xl !ring-0 focus:!ring-2 focus:!ring-[oklch(var(--ring))]",
                            button:
                                "btn w-full !rounded-xl !bg-[oklch(var(--primary))] !text-[oklch(var(--primary-foreground))]",
                            anchor: "underline underline-offset-2 hover:opacity-90",
                            message:
                                "rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700",
                        },
                        variables: {
                            default: {
                                colors: {
                                    brand: "oklch(60% 0.17 254)",
                                    brandAccent: "oklch(70% 0.12 254)",
                                    inputText: "oklch(22% 0.02 255)",
                                },
                            },
                        },
                    }}
                />
            </div>
        </main>
    );
}
