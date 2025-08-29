"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/library/supabaseClient";

const NAV = [
    { href: "/recipes", label: "Recipes" },
    { href: "/recipes/new", label: "Add" },
    { href: "/plan", label: "Plan" },
];

export default function Header() {
    const session = useSession();
    const pathname = usePathname();
    const router = useRouter();

    async function signOut() {
        await supabase.auth.signOut();
        router.replace("/login");
    }

    return (
        <header className="sticky top-0 z-40 bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] shadow">
            <div className="mx-auto max-w-6xl px-6">
                <div className="flex h-14 items-center justify-between">
                    <Link href="/" className="font-semibold tracking-tight">
                        Meal Buddy
                    </Link>

                    <nav className="ml-auto flex items-center gap-1 text-sm">
                        {NAV.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`rounded-lg px-3 py-2 transition ${active ? "bg-white/20" : "hover:bg-white/10"
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}

                        {session ? (
                            <button
                                onClick={signOut}
                                className="ml-2 rounded-lg px-3 py-2 transition bg-white/10 hover:bg-white/20"
                            >
                                Sign out
                            </button>
                        ) : (
                            <Link
                                href="/login"
                                className="ml-2 rounded-lg px-3 py-2 transition bg-white text-[oklch(var(--primary))] hover:opacity-90"
                            >
                                Sign in
                            </Link>
                        )}
                    </nav>
                </div>
            </div>
        </header>
    );
}
