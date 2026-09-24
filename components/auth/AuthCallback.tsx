"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * The browser client finishes the sign-in on its own when it starts: it exchanges ?code= (magic link)
 * or reads #access_token (invite link). We only wait for that, check membership, then continue.
 */
export function AuthCallback() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [problem, setProblem] = useState<"invalid" | "notMember" | null>(null);

  useEffect(() => {
    // Invite links (sent by the admin API) carry #access_token — the implicit flow, which the PKCE
    // browser client refuses to read. Take the tokens before the client starts and set the session ourselves.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const supabase = supabaseBrowser();
    (async () => {
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return setProblem("invalid");
      const { data: me } = await supabase.from("members").select("user_id").eq("user_id", session.user.id).maybeSingle();
      if (!me) {
        await supabase.auth.signOut();
        return setProblem("notMember");
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only same-site paths, never an absolute URL from the link
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : `/${locale}`);
    })();
  }, [locale]);

  if (!problem) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("signingIn")}
      </p>
    );
  }
  return (
    <div className="workspace-panel grid max-w-sm gap-4 p-6 text-center">
      <p className="text-[15px]" role="alert">
        {problem === "invalid" ? t("linkInvalid") : t("notMember")}
      </p>
      <Button asChild className="rounded-full">
        <Link href="/login">{t("title")}</Link>
      </Button>
    </div>
  );
}
