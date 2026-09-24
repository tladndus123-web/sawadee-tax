"use client";

import { Loader2, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Local Supabase keeps sent mail in Mailpit instead of delivering it */
const LOCAL_MAIL = "http://127.0.0.1:54324";
const isLocal = () => /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** Passwordless sign-in: invited members get a magic link by email (sign-up is disabled). */
export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    const next = params.get("next") || `/${locale}`;
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (!error) return setState("sent");
    setState("idle");
    if (error.status === 429) setError(t("tooSoon"));
    // Unknown email with sign-up disabled
    else if (error.status === 422 || error.status === 400 || /signup|not allowed/i.test(error.message)) setError(t("notInvited"));
    else setError(t("fail"));
  };

  return (
    <div className="workspace-panel grid w-full max-w-sm gap-6 p-6 sm:p-8">
      <div className="grid justify-items-center gap-3 text-center">
        <AppMark className="size-14 drop-shadow-[0_4px_12px_rgb(201_89_221/30%)]" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </div>

      {state === "sent" ? (
        <div className="grid gap-4 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
            <Mail className="size-5" aria-hidden />
          </span>
          <p className="text-[15px]" role="status">
            {t("sent", { email: email.trim() })}
          </p>
          <Button type="button" variant="ghost" className="mx-auto rounded-full" onClick={() => setState("idle")}>
            {t("again")}
          </Button>
        </div>
      ) : (
        <form onSubmit={send} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("email")}</span>
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 rounded-full text-[15px]" disabled={state === "sending"}>
            {state === "sending" && <Loader2 className="size-4 animate-spin" />}
            {t("send")}
          </Button>
        </form>
      )}

      {isLocal() && (
        <a href={LOCAL_MAIL} target="_blank" rel="noreferrer" className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline">
          {t("localMail", { url: LOCAL_MAIL })}
        </a>
      )}
    </div>
  );
}
