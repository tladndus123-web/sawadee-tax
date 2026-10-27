"use client";

// Settings → sign in with Face ID: the devices with a passkey for this account (name, added, last used), remove one
// (a lost phone), register this device. Each person sees only their own (Supabase Auth).

import { KeyRound, Loader2, Smartphone, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { passkeyHere, passkeySupported, setPasskeyHere } from "@/lib/auth/passkey";
import { registerThisDevice } from "@/lib/auth/passkey-client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useFoldStatus } from "./SettingsFold";

type Item = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

export function PasskeyCard() {
  const t = useTranslations("passkey");
  const locale = useLocale();
  const [items, setItems] = useState<Item[] | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [here, setHere] = useState<string | null>(null);
  useFoldStatus(items?.length ? t("count", { count: items.length }) : null, !!items?.length);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().auth.passkey.list();
    setItems(error ? [] : ((data ?? []) as Item[]));
  }, []);
  useEffect(() => {
    void load();
    void passkeySupported().then(setSupported);
    setHere(passkeyHere());
  }, [load]);

  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const add = async () => {
    setBusy("add");
    try {
      const r = await registerThisDevice();
      if (r !== "cancel") toast.success(r === "ok" ? t("registered") : t("alreadyHere"));
      setHere(passkeyHere());
      await load();
    } catch {
      toast.error(t("registerFail"));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (it: Item) => {
    if (!confirm(t("removeAsk", { name: it.friendly_name || t("title") }))) return;
    setBusy(it.id);
    try {
      const { error } = await supabaseBrowser().auth.passkey.delete({ passkeyId: it.id });
      if (error) throw error;
      if (here === it.id) {
        setPasskeyHere(null);
        setHere(null);
      }
      toast.success(t("removed"));
      await load();
    } catch {
      toast.error(t("registerFail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="passkey-title" className="workspace-panel grid content-start gap-3 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="passkey-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <KeyRound className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      {items === null ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
              <Smartphone className="size-5 flex-none text-muted-foreground" aria-hidden />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[15px] font-medium">
                  {it.friendly_name || t("title")}
                  {here === it.id && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t("thisDevice")}</span>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("added", { date: day.format(new Date(it.created_at)) })}
                  {it.last_used_at && ` · ${t("lastUsed", { date: day.format(new Date(it.last_used_at)) })}`}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-9 flex-none rounded-full" disabled={busy !== null} aria-label={`${t("remove")} ${it.friendly_name ?? ""}`} onClick={() => void remove(it)}>
                {busy === it.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {supported === false ? (
        <p className="text-sm text-muted-foreground">{t("unsupported")}</p>
      ) : (
        supported && (
          <Button type="button" variant={items?.length ? "outline" : "default"} className="h-10 w-fit rounded-full px-5" disabled={busy !== null} onClick={() => void add()}>
            {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {t("addThis")}
          </Button>
        )
      )}
    </section>
  );
}
