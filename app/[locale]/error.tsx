"use client";

// Anything that breaks a page shows this instead of the browser's bare "application error". The usual cause after a
// deploy is a page left open on the old version asking for files that are gone: that reloads itself once.

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const RELOADED = "trl.reloaded-at";

/** A page still running the previous version asked for a file the new one no longer has */
const isStaleBuild = (e: Error) => e.name === "ChunkLoadError" || /Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(e.message);

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    console.error(error);
    if (!isStaleBuild(error)) return;
    // Reload once (not in a loop if the new version breaks too)
    try {
      const last = Number(sessionStorage.getItem(RELOADED) || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <section className="mx-auto grid w-full max-w-md justify-items-center gap-4 px-4 py-16 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-full bg-muted" aria-hidden>
        <RotateCw className="size-6 text-muted-foreground" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" className="h-11 rounded-full px-5" onClick={() => window.location.reload()}>
          <RotateCw className="size-4" />
          {t("reload")}
        </Button>
        <Button type="button" variant="secondary" className="h-11 rounded-full px-5" onClick={() => (reset(), window.location.assign("/"))}>
          {t("home")}
        </Button>
      </div>
      {error.digest && <p className="mono text-[11px] text-muted-foreground">#{error.digest}</p>}
    </section>
  );
}
