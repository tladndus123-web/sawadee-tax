"use client";

import { CircleCheck, Link2Off, Loader2, MessageCircle, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Optional: the bot's LINE ID (e.g. "@123abcde") for an "add friend" link
const BOT_ID = process.env.NEXT_PUBLIC_LINE_BOT_ID;
/** The bot's "add friend" QR code (from the LINE Official Account Manager), redrawn as a crisp SVG */
const QR_SRC = "/line-qr.svg";
const LINE_GREEN = "#06c755";

/** One numbered step; the step the person is on is highlighted */
function Step({ n, active, done, children }: { n: number; active: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors",
          active ? "bg-[#06c755] text-white" : done ? "bg-[#06c755]/15 text-[#06a14a] dark:text-[#3ddc84]" : "bg-muted text-muted-foreground",
        )}
      >
        {n}
      </span>
      <div className={cn("grid min-w-0 gap-2.5 pt-0.5 text-[15px] leading-relaxed", !active && !done && "text-muted-foreground")}>{children}</div>
    </li>
  );
}

/** Link my LINE account: add the bot (QR), get a one-time code here, send it to the bot (lib/line-bot.ts) */
export function LineCard() {
  const t = useTranslations("line");
  const me = useMe();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!me.userId) return;
    const { data } = await supabaseBrowser().from("members").select("line_user_id").eq("user_id", me.userId).maybeSingle();
    const now = !!data?.line_user_id;
    setLinked(now);
    return now;
  }, [me.userId]);
  useEffect(() => void check(), [check]);

  // While a code is out, watch for the bot to use it (the code lives 10 minutes)
  useEffect(() => {
    if (!code) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 600_000) {
        setCode(null);
        return;
      }
      if (await check()) {
        setCode(null);
        toast.success(t("done"));
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [code, check, t]);

  const getCode = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabaseBrowser().rpc("line_link_code");
      if (error) throw error;
      setCode(data as string);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const { error } = await supabaseBrowser().from("members").update({ line_user_id: null }).eq("user_id", me.userId!);
      if (error) throw error;
      setLinked(false);
      toast.success(t("unlinked"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="line-title" className="workspace-panel grid content-start gap-5 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="line-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MessageCircle className="size-5 text-[#06c755]" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {linked === null ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-4 text-ok" aria-hidden />
            {t("linked")}
          </p>
          <Button type="button" variant="ghost" className="h-10 rounded-full" disabled={busy} onClick={() => void unlink()}>
            <Link2Off className="size-4" />
            {t("unlink")}
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
          {/* QR: always on white so every LINE camera reads it, also in dark mode */}
          <figure className="grid justify-items-center gap-2.5 justify-self-center">
            <div className="rounded-[22px] bg-white p-2.5 shadow-[0_1px_2px_rgb(0_0_0/6%),0_8px_24px_rgb(0_0_0/8%)] ring-1 ring-black/5 dark:ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
              <img src={QR_SRC} alt={t("qrAlt")} width={168} height={168} className="block size-[168px] rounded-xl [image-rendering:pixelated]" />
            </div>
            <figcaption className="flex items-center gap-1.5 text-xs font-medium" style={{ color: LINE_GREEN }}>
              <ScanLine className="size-3.5" aria-hidden />
              {t("qrCaption")}
            </figcaption>
          </figure>

          <div className="grid gap-4">
            <p className="text-sm font-semibold">{t("steps")}</p>
            <ol className="grid gap-4">
              <Step n={1} active={false} done>
                <p>{t("step1")}</p>
                {BOT_ID && (
                  <a
                    href={`https://line.me/R/ti/p/${encodeURIComponent(BOT_ID)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white transition-colors hover:brightness-95"
                    style={{ background: LINE_GREEN }}
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    {t("addFriend")}
                  </a>
                )}
              </Step>
              <Step n={2} active={!code} done={!!code}>
                <p>{t("step2", { button: t("getCode") })}</p>
                {!code && (
                  <Button type="button" className="h-10 w-fit rounded-full" disabled={busy} onClick={() => void getCode()}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {t("getCode")}
                  </Button>
                )}
              </Step>
              <Step n={3} active={!!code}>
                <p>{t("step3")}</p>
                {code && (
                  <div className="grid gap-2.5">
                    <p
                      className="rounded-2xl bg-muted py-4 text-center font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums select-all"
                      aria-live="polite"
                    >
                      {code}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        {t("waiting")}
                      </span>
                      <Button type="button" variant="ghost" className="ml-auto h-9 rounded-full" disabled={busy} onClick={() => void getCode()}>
                        {t("newCode")}
                      </Button>
                    </div>
                  </div>
                )}
              </Step>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
