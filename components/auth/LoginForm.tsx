"use client";

import { ArrowRight, Loader2, Lock, Mail, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Local Supabase keeps sent mail in Mailpit instead of delivering it */
const LOCAL_MAIL = "http://127.0.0.1:54324";
const isLocal = () => /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** Each language written in its own script */
const LANGS: [Locale, string][] = [
  ["ko", "한국어"],
  ["ja", "日本語"],
  ["th", "ไทย"],
  ["en", "English"],
];

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
    <div className="grid w-full max-w-[420px] justify-items-center gap-6">
      <div className="login-card relative w-full">
        {/* Apple Intelligence edge glow: a slow, soft spectrum circling behind the card */}
        <span className="login-glow" aria-hidden />
        <div className="relative grid gap-7 rounded-[28px] bg-card px-7 pt-9 pb-7 shadow-[var(--shadow-lift)] sm:px-9">
          <header className="grid justify-items-center gap-4 text-center">
            <AppMark className="size-16 drop-shadow-[0_6px_16px_rgb(201_89_221/35%)]" />
            <div className="grid gap-2">
              <p className="ai-text text-[13px] font-semibold tracking-tight">{t("title")}</p>
              <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-balance">
                {state === "sent" ? t("sentTitle") : t("welcome")}
              </h1>
            </div>
          </header>

          {state === "sent" ? (
            <div className="grid justify-items-center gap-5 text-center">
              <span className="intelligence-mark size-14">
                <MailCheck className="size-6" aria-hidden />
              </span>
              <p className="text-[15px] leading-relaxed text-muted-foreground" role="status">
                {t("sent", { email: email.trim() })}
              </p>
              {isLocal() && (
                <Button asChild className="h-11 w-full rounded-full text-[15px]">
                  <a href={LOCAL_MAIL} target="_blank" rel="noreferrer">
                    <Mail className="size-4" />
                    {t("openMail")}
                  </a>
                </Button>
              )}
              <Button type="button" variant="ghost" className="rounded-full text-primary" onClick={() => setState("idle")}>
                {t("again")}
              </Button>
            </div>
          ) : (
            <form onSubmit={send} className="grid gap-4">
              <p className="text-center text-[15px] leading-relaxed text-pretty text-muted-foreground">{t("intro")}</p>
              <label className="group relative block">
                <span className="sr-only">{t("email")}</span>
                <Mail className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  className="h-[52px] w-full rounded-2xl border border-input bg-background/60 pr-4 pl-11 text-[16px] transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_14%,transparent)] aria-invalid:border-bad"
                />
              </label>
              {error && (
                <p role="alert" className="-mt-1 text-center text-sm text-bad">
                  {error}
                </p>
              )}
              <Button type="submit" className="group h-[52px] rounded-2xl text-[16px] font-semibold" disabled={state === "sending" || !email.trim()}>
                {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("send")}
                {state !== "sending" && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {t("inviteOnly")}
              </p>
            </form>
          )}
        </div>
      </div>

      <LanguagePicker />

      {isLocal() && state !== "sent" && (
        <a href={LOCAL_MAIL} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline">
          {t("localMail", { url: "Mailpit" })}
        </a>
      )}
    </div>
  );
}

/** Plain row of language names; the current one sits in a soft pill */
function LanguagePicker() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <nav aria-label={t("language")} className={cn("flex flex-wrap items-center justify-center gap-1 transition-opacity", pending && "opacity-60")}>
      {LANGS.map(([code, label]) => {
        const on = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-current={on ? "true" : undefined}
            onClick={() => {
              if (on) return;
              // Keep "where to go after signing in", but in the newly chosen language
              const q = new URLSearchParams(params.toString());
              const next = q.get("next");
              if (next) q.set("next", next.replace(/^\/(ko|th|en|ja)(?=\/|$)/, `/${code}`));
              const query = q.toString();
              start(() => router.replace(`${pathname}${query ? `?${query}` : ""}`, { locale: code }));
            }}
            className={cn(
              "min-h-9 rounded-full px-3.5 text-[13px] transition-colors",
              on ? "bg-card font-semibold text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
