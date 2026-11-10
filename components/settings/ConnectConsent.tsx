"use client";

// The "허용" page of the agent sign-in (owner, 2026-11-08: "주소 하나 넣고 허용만 누르면 연결"): who is asking, what it
// may do, allow / refuse. On allow the browser goes back to the agent with a one-time code (app/api/oauth/approve).

import { Ban, Bot, CircleCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { redirectLabel, staysOnDevice } from "@/lib/redirect-label";
import { useMe } from "@/lib/role-store";

export function ConnectConsent() {
  const t = useTranslations("connect");
  const tb = useTranslations("bot");
  const q = useSearchParams();
  const me = useMe();
  const [name, setName] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ allowed: boolean; to: string } | null>(null);
  const req = { client_id: q.get("client_id") ?? "", redirect_uri: q.get("redirect_uri") ?? "", code_challenge: q.get("code_challenge") ?? "", state: q.get("state") ?? "" };

  useEffect(() => {
    if (!me.loaded || !me.owner) return;
    void fetch(`/api/oauth/approve?${new URLSearchParams({ client_id: req.client_id, redirect_uri: req.redirect_uri })}`).then(async (r) => {
      if (!r.ok) return setBad(true);
      setName(((await r.json()) as { name: string }).name);
    });
  }, [me.loaded, me.owner, req.client_id, req.redirect_uri]);

  const answer = async (allow: boolean) => {
    setBusy(true);
    const r = await fetch("/api/oauth/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...req, allow }) });
    setBusy(false);
    if (!r.ok) return setBad(true);
    const { redirect } = (await r.json()) as { redirect: string };
    setDone({ allowed: allow, to: redirect });
    window.location.href = redirect;
  };

  const box = (children: React.ReactNode) => <div className="workspace-panel mx-auto mt-6 grid w-full max-w-md gap-5 p-6 sm:mt-12 sm:p-8">{children}</div>;

  if (!me.loaded) return box(<Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Loading" />);
  if (!me.owner) return box(<p className="text-center text-[15px] text-muted-foreground">{t("ownerOnly")}</p>);
  if (bad) return box(<p className="text-center text-[15px] text-bad">{t("bad")}</p>);
  if (done)
    return box(
      <div className="grid gap-3 text-center">
        <p className="text-[17px] font-semibold">{done.allowed ? t("connected") : t("refused")}</p>
        <p className="text-[14px] text-muted-foreground">{t("backToBot")}</p>
        <a href={done.to} className="text-[14px] font-medium text-primary hover:underline">
          {t("openBot")}
        </a>
      </div>,
    );

  return box(
    <>
      <div className="grid justify-items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Bot className="size-7" aria-hidden />
        </span>
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{name ? t("title", { name }) : "…"}</h1>
        <p className="text-[14px] text-muted-foreground">{t("sub")}</p>
      </div>
      {/* The name above is whatever the agent calls itself: the address the code goes to is what can be trusted */}
      <p className={`rounded-2xl p-4 text-[14px] ${staysOnDevice(req.redirect_uri) ? "bg-muted/50 text-muted-foreground" : "bg-warn-soft text-foreground"}`}>
        <span className="font-medium break-all">{t("sendsTo", { host: redirectLabel(req.redirect_uri) })}</span>
        {!staysOnDevice(req.redirect_uri) && <span className="mt-1 block">{t("sendsToWeb")}</span>}
      </p>
      <ul className="grid gap-2 rounded-2xl bg-muted/50 p-4 text-[14px]">
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
          {tb("can.read")}
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
          {tb("can.calendar")}
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
          {tb("can.draft")}
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-0.5 size-4 flex-none text-ok" aria-hidden />
          {tb("can.line")}
        </li>
        <li className="flex gap-2">
          <Ban className="mt-0.5 size-4 flex-none text-bad" aria-hidden />
          {tb("can.not")}
        </li>
      </ul>
      <div className="grid gap-2">
        <Button type="button" className="h-12 rounded-full text-[15px]" disabled={busy || !name} onClick={() => void answer(true)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("allow")}
        </Button>
        <Button type="button" variant="ghost" className="h-11 rounded-full" disabled={busy || !name} onClick={() => void answer(false)}>
          {t("deny")}
        </Button>
      </div>
      <p className="text-center text-[12px] text-muted-foreground">{t("note")}</p>
    </>,
  );
}
