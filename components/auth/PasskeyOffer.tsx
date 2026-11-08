"use client";

// After an email sign-in on a device that can do Face ID / fingerprint: offer quick sign-in (간편 로그인), so the next
// sign-in is a glance. "Later" hides it for two weeks. Not shown after a passkey sign-in. On the dashboard only, at the
// page's width (owner 2026-10-27: it sat on top of every screen).

import { KeyRound, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
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
  const onDashboard = usePathname() === "/";

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

  if (!show || !onDashboard) return null;

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
    // One strip (owner, 2026-11-06: the banner took half a phone screen): mark, title (the reason on wider screens),
    // the register button; "later" is the × and hides it for two weeks as before
    <section aria-labelledby="passkey-offer" className="workspace-panel relative mx-auto mb-4 flex w-full max-w-6xl items-center gap-2.5 py-2 pr-11 pl-3 sm:mb-5 sm:gap-3 sm:py-2.5 sm:pl-4">
      {/* 간편 로그인 mark (public/quick-signin.svg), the app icon's family */}
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
      <img src="/quick-signin.svg" alt="" aria-hidden="true" className="size-7 flex-none rounded-[8px] shadow-[0_3px_8px_rgb(10_92_230/0.3)] sm:size-8 sm:rounded-[9px]" />
      <div className="grid min-w-0 flex-1 gap-0">
        <h2 id="passkey-offer" className="truncate text-[14px] leading-snug font-semibold">
          {/* Phones: a short line, so the strip stays one line */}
          <span className="sm:hidden">{t("offerShort")}</span>
          <span className="max-sm:hidden">{t("offerTitle")}</span>
        </h2>
        <p className="truncate text-[12px] text-muted-foreground max-sm:hidden">{t("offerBody")}</p>
      </div>
      <Button type="button" className="h-9 flex-none rounded-full px-3.5 sm:px-4" disabled={busy} onClick={() => void register()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {t("register")}
      </Button>
      <button type="button" onClick={later} aria-label={t("later")} title={t("later")} className="press absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
        <X className="size-4" />
      </button>
    </section>
  );
}
