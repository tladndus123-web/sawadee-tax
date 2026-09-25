"use client";

import { CircleCheck, Link2Off, Loader2, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";

// Optional: the bot's LINE ID (e.g. "@123abcde") for an "add friend" link
const BOT_ID = process.env.NEXT_PUBLIC_LINE_BOT_ID;

/** Link my LINE account: get a one-time code here, send it to the bot (lib/line-bot.ts) */
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
    <section aria-labelledby="line-title" className="workspace-panel grid content-start gap-4 p-5 sm:p-6">
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
      ) : code ? (
        <div className="grid gap-3">
          <p
            className="rounded-2xl bg-muted py-4 text-center font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums select-all"
            aria-live="polite"
          >
            {code}
          </p>
          <p className="text-sm text-muted-foreground">{t("codeHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {BOT_ID && (
              <a
                href={`https://line.me/R/ti/p/${encodeURIComponent(BOT_ID)}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center rounded-full bg-[#06c755] px-4 text-sm font-medium text-white hover:bg-[#05b34c]"
              >
                {t("addFriend")}
              </a>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("waiting")}
            </span>
            <Button type="button" variant="ghost" className="ml-auto h-10 rounded-full" disabled={busy} onClick={() => void getCode()}>
              {t("newCode")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("notLinked")}</p>
          <Button type="button" className="h-10 rounded-full" disabled={busy} onClick={() => void getCode()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("getCode")}
          </Button>
        </div>
      )}
    </section>
  );
}
