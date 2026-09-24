"use client";

import { Building2, Loader2, Pencil, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportLang } from "@/lib/export";
import { useLedger } from "@/lib/ledger-store";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { digitsOnly, dmy } from "@/lib/thai-tax";
import { FORM_LANGS, type Tri } from "@/lib/types";
import { saveVendorName, useVendors } from "@/lib/vendor-store";
import type { Vendor } from "@/lib/vendors";

/** Vendor dictionary: every seller seen in saved documents, with their ledger totals. */
export function VendorList() {
  const t = useTranslations("vendors");
  const locale = useLocale();
  const lang = exportLang(locale);
  const { vendors, loaded } = useVendors();
  const { entries } = useLedger();
  const [q, setQ] = useState("");

  // Documents in the ledger (not drafts, not trash) per vendor tax ID
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; satang: number; last: string }>();
    for (const e of entries) {
      if (e.deletedAt !== null || e.status !== "final") continue;
      const key = digitsOnly(e.doc.seller.taxId);
      const s = m.get(key) ?? { count: 0, satang: 0, last: "" };
      s.count += 1;
      s.satang += toSatang(e.doc.totals.net);
      if (e.doc.date > s.last) s.last = e.doc.date;
      m.set(key, s);
    }
    return m;
  }, [entries]);

  const needle = q.trim().toLowerCase();
  const list = vendors
    .filter((v) => !needle || v.taxId.includes(needle.replace(/\D/g, "") || "∅") || FORM_LANGS.some((l) => v.name[l].toLowerCase().includes(needle)))
    .sort((a, b) => (stats.get(b.taxId)?.last ?? "").localeCompare(stats.get(a.taxId)?.last ?? ""));

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("hint")}</p>
      </header>
      {vendors.length > 0 && (
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 rounded-full pl-10" />
        </label>
      )}
      {!loaded ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : list.length === 0 ? (
        <div className="workspace-panel grid justify-items-center gap-4 px-6 py-16 text-center">
          <span className="intelligence-mark is-soft size-14 text-muted-foreground">
            <Building2 className="size-6" aria-hidden />
          </span>
          <p className="text-[15px] text-muted-foreground">{vendors.length ? t("noMatch") : t("empty")}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.map((v) => (
            <VendorRow key={v.id} v={v} lang={lang} stat={stats.get(v.taxId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VendorRow({ v, lang, stat }: { v: Vendor; lang: "th" | "en" | "ja"; stat?: { count: number; satang: number; last: string } }) {
  const t = useTranslations("vendors");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<Tri>(v.name);
  const [busy, setBusy] = useState(false);
  const shown = v.name[lang] || v.name.en || v.name.th;
  const branch = v.branch[lang] || v.branch.en || v.branch.th;

  return (
    <li className="workspace-panel grid gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span className="intelligence-mark is-soft size-10 flex-none">
          <Building2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{shown || "—"}</p>
          {lang !== "th" && v.name.th && (
            <p lang="th" className="truncate text-xs text-muted-foreground">
              {v.name.th}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="mono">{v.taxId}</span>
            {branch && <span className="rounded-full bg-muted px-2 py-0.5">{branch}</span>}
          </p>
        </div>
        <div className="grid text-right">
          <span className="text-[15px] font-semibold tabular-nums">{baht(fromSatang(stat?.satang ?? 0))}</span>
          <span className="text-xs text-muted-foreground">
            {t("docs", { count: stat?.count ?? 0 })}
            {stat?.last ? ` · ${t("last", { date: dmy(stat.last) })}` : ""}
          </span>
        </div>
        {!editing && (
          <Button type="button" variant="ghost" size="icon" className="size-9 flex-none" aria-label={t("edit")} onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      {editing && (
        <form
          className="grid gap-2 rounded-2xl bg-muted/50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await saveVendorName(v.id, { th: name.th.trim(), en: name.en.trim(), ja: name.ja.trim() });
              toast.success(t("saved"));
              setEditing(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {FORM_LANGS.map((l) => (
            <label key={l} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{l}</span>
              <Input lang={l} value={name[l]} onChange={(e) => setName({ ...name, [l]: e.target.value })} aria-label={`${t("edit")} ${l}`} className="h-9" />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => (setName(v.name), setEditing(false))}>
              ✕
            </Button>
            <Button type="submit" className="rounded-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
