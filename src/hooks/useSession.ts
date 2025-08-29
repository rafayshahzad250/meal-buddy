"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/library/supabaseClient";

export function useSession() {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useEffect(() => {
        let mounted = true;

        supabase.auth.getSession().then(({ data }) => {
            if (mounted) setSession(data.session ?? null);
        });

        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
            if (mounted) setSession(s ?? null);
        });

        return () => {
            mounted = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    return session;
}
