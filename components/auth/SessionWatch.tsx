"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import { sessionEndsAt } from "@/lib/auth/session-limit";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * A page left open past the sign-in limit (12 hours): the middleware only checks when a page loads,
 * and the browser talks to Supabase directly, so end the session here too and show the login page
 * with the "signed out for security" message. Checks again when the tab comes back (phones pause timers).
 */
export function SessionWatch() {
  const locale = useLocale();

  useEffect(() => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const end = async () => {
      if (done) return;
      done = true;
      await supabase.auth.signOut({ scope: "local" });
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/${locale}/login?expired=1&next=${encodeURIComponent(next)}`);
    };

    const check = async () => {
      clearTimeout(timer);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const endsAt = session ? sessionEndsAt(session.access_token) : null;
      if (endsAt == null) return;
      const left = endsAt - Date.now();
      if (left <= 0) return void end();
      // setTimeout cannot wait longer than ~24.8 days; the limit is hours, but stay safe
      timer = setTimeout(() => void check(), Math.min(left + 500, 2 ** 31 - 1));
    };

    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void check();
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      sub.subscription.unsubscribe();
    };
  }, [locale]);

  return null;
}
