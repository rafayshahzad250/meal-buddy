"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/useSession";

export default function LoginGate({ children }: { children: React.ReactNode }) {
    const session = useSession();
    const router = useRouter();

    useEffect(() => {
        if (session === null) router.replace("/login");
    }, [session, router]);

    if (session === undefined) {
        return <div className="p-6 text-sm text-zinc-500">Checking your session…</div>;
    }

    if (session === null) return null; // already redirecting
    return <>{children}</>;
}
