"use client";

// After an email sign-in on a device that can do Face ID / fingerprint: offer to register it, so the next sign-in
// (and the one every 12 hours) is a glance. "Later" hides it for two weeks. Not shown after a passkey sign-in.

import { KeyRound, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { laterAt, passkeyHere, passkeySupported, setLater, setPasskeyHere, shouldOffer } from "@/lib/auth/passkey";
import { registerThisDevice } from "@/lib/auth/passkey-client";
import { signInMethods } from "@/lib/auth/session-limit";
import { supabaseBrowser } from "@/lib/supabase/client";

export function PasskeyOffer() {
  const t = useTranslations("passkey");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [supported, { data }] = await Promise.all([passkeySupported(), supabaseBrowser().auth.getSession()]);
      const methods = data.session ? signInMethods(data.session.access_token) : [];
      // Signed in with a passkey: this device has one (synced from another device, or this browser forgot)
      if (methods.some((m) => /passkey|webauthn/i.test(m))) {
        if (!passkeyHere()) setPasskeyHere("registered");
        return;
      }
      if (live && data.session && shouldOffer({ supported, registeredHere: !!passkeyHere(), laterAt: laterAt(), now: Date.now() })) setShow(true);
    })();
    return () => void (live = false);
  }, []);

  if (!show) return null;

  const later = () => {
    setLater();
    setShow(false);
  };
  const register = async () => {
    setBusy(true);
    try {
      const r = await registerThisDevice();
      if (r === "cancel") return;
      toast.success(r === "ok" ? t("registered") : t("alreadyHere"));
      setShow(false);
    } catch {
      toast.error(t("registerFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="passkey-offer" className="workspace-panel relative mx-auto mb-5 grid w-full max-w-3xl grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 pr-11 sm:p-5 sm:pr-12">
      {/* 간편 로그인 mark (public/quick-signin.svg), the app icon's family */}
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
      <img src="/quick-signin.svg" alt="" aria-hidden="true" className="size-10 rounded-[11px] shadow-[0_4px_10px_rgb(10_92_230/0.3)]" />
      <div className="grid gap-0.5">
        <h2 id="passkey-offer" className="text-[15px] font-semibold">
          {t("offerTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("offerBody")}</p>
      </div>
      <div className="col-start-2 flex flex-wrap gap-2">
        <Button type="button" className="h-10 rounded-full px-5" disabled={busy} onClick={() => void register()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {t("register")}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-full px-4" disabled={busy} onClick={later}>
          {t("later")}
        </Button>
      </div>
      <button type="button" onClick={later} aria-label={t("later")} className="press absolute top-3 right-3 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
        <X className="size-4" />
      </button>
    </section>
  );
}
