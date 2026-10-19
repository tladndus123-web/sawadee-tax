"use client";

// "Sign in with Face ID" on the login page (lib/auth/passkey). Membership is checked by the callback page, as for
// links and codes. Closing the system sheet only shows a hint (no passkey here yet → use the email).

import { Loader2, ScanFace } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isCancel } from "@/lib/auth/passkey";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function PasskeySignIn({ primary }: { primary: boolean }) {
  const t = useTranslations("passkey");
  const locale = useLocale();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const go = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPasskey();
      if (error) throw error;
      const next = params.get("next") || `/${locale}`;
      window.location.replace(`/${locale}/auth/callback?next=${encodeURIComponent(next)}`);
    } catch (e) {
      setBusy(false);
      setNote(isCancel(e) ? { text: t("cancelled"), bad: false } : { text: t("fail"), bad: true });
    }
  };

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        className={cn("h-[52px] rounded-2xl text-[16px] font-semibold", !primary && "bg-background/60")}
        disabled={busy}
        onClick={() => void go()}
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ScanFace className="size-5" aria-hidden />}
        {t("signIn")}
      </Button>
      {/* Not registered here yet: the system sheet would only say "no passkeys", so say what to do first */}
      <p className="text-center text-xs leading-relaxed text-pretty text-muted-foreground">{primary ? t("signInHint") : t("firstTimeHint")}</p>
      {note && (
        <p role={note.bad ? "alert" : "status"} className={cn("text-center text-sm", note.bad ? "text-bad" : "text-muted-foreground")}>
          {note.text}
        </p>
      )}
    </div>
  );
}

/** A thin rule with "or" in the middle */
export function OrRule() {
  const t = useTranslations("passkey");
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {t("or")}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
