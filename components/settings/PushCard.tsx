"use client";

// Admins: phone notifications on this device (the same reminders as LINE, without LINE), with a test button.

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type PushState, pushState, turnOff, turnOn } from "@/lib/push-client";
import { useMe } from "@/lib/role-store";

export function PushCard() {
  const t = useTranslations("push");
  const isAdmin = useMe().role === "admin";
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  if (!isAdmin) return null;

  const run = async (fn: () => Promise<PushState>, ok?: string) => {
    setBusy(true);
    try {
      const s = await fn();
      setState(s);
      if (s === "on" && ok) toast.success(ok);
      if (s === "denied") toast.error(t("denied"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { devices?: number; error?: string };
      if (res.ok && json.devices) toast.success(t("testSent"));
      else toast.error(json.error === "rate" ? t("testRate") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="push-title" className="workspace-panel grid content-start gap-3 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="push-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Bell className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      {state === null ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : state === "needsInstall" ? (
        <p className="rounded-2xl bg-muted/60 px-3 py-2.5 text-sm">{t("needsInstall")}</p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-muted-foreground">{t("unsupported")}</p>
      ) : state === "denied" ? (
        <p className="rounded-2xl bg-warn-soft px-3 py-2.5 text-sm">{t("denied")}</p>
      ) : state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex w-full items-center gap-1.5 text-sm font-medium">
            <BellRing className="size-4 text-ok" aria-hidden />
            {t("on")}
          </span>
          <Button type="button" variant="outline" className="h-10 rounded-full" disabled={busy} onClick={() => void test()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            {t("test")}
          </Button>
          <Button type="button" variant="ghost" className="h-10 rounded-full" disabled={busy} onClick={() => void run(turnOff)}>
            <BellOff className="size-4" />
            {t("turnOff")}
          </Button>
        </div>
      ) : (
        <Button type="button" className="h-10 w-fit rounded-full px-5" disabled={busy} onClick={() => void run(turnOn, t("turnedOn"))}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          {t("turnOn")}
        </Button>
      )}
    </section>
  );
}
