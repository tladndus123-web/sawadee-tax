"use client";

// Put the app on the phone's home screen: one button where the browser allows it (Android Chrome), the Share-menu
// steps on iPhone, the browser-menu step elsewhere. `compact` is the dismissible strip on the dashboard (phones only).

import { CircleCheck, Download, EllipsisVertical, Share, SquarePlus, Smartphone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { promptInstall, useInstall } from "@/lib/install-app";
import { useFoldStatus } from "./SettingsFold";

const HIDE_KEY = "trl.installTipHidden";
const noop = () => () => {};

export function InstallCard({ compact }: { compact?: boolean }) {
  const t = useTranslations("install");
  const state = useInstall();
  const tf = useTranslations("fold");
  useFoldStatus(state === "installed" ? tf("installed") : null, true);
  const hiddenAtStart = useSyncExternalStore(
    noop,
    () => {
      try {
        return localStorage.getItem(HIDE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [hidden, setHidden] = useState(false);

  if (state === "server") return null;
  if (compact && (state === "installed" || hiddenAtStart || hidden)) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };

  const steps =
    state === "ios" ? (
      <ol className="grid gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <span className="grid size-6 flex-none place-items-center rounded-full bg-muted text-xs font-semibold">1</span>
          <span>{t.rich("ios1", { icon: () => <Share className="inline size-4 align-[-3px] text-primary" aria-label="Share" /> })}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="grid size-6 flex-none place-items-center rounded-full bg-muted text-xs font-semibold">2</span>
          <span>{t.rich("ios2", { icon: () => <SquarePlus className="inline size-4 align-[-3px]" aria-hidden /> })}</span>
        </li>
      </ol>
    ) : state === "prompt" ? (
      <Button type="button" className="h-10 w-fit rounded-full px-5" onClick={() => void promptInstall()}>
        <Download className="size-4" />
        {t("button")}
      </Button>
    ) : state === "manual" ? (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t.rich("manual", { icon: () => <EllipsisVertical className="inline size-4 align-[-3px] text-foreground" aria-label="Menu" /> })}
      </p>
    ) : null;

  if (compact) {
    return (
      <section className="workspace-panel relative grid gap-2.5 p-4 pr-11 md:hidden" aria-label={t("title")}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4 text-brand" aria-hidden />
          {t("tip")}
        </p>
        {steps}
        <button type="button" onClick={hide} aria-label={t("hide")} className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="install-title" className="workspace-panel hover-lift [--lift:1.006] grid content-start gap-3 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="install-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Smartphone className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      {state === "installed" ? (
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck className="size-4 text-ok" aria-hidden />
          {t("installed")}
        </p>
      ) : (
        steps
      )}
    </section>
  );
}
