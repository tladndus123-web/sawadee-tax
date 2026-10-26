import { Download, FileImage } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppMark } from "@/components/layout/app-mark";
import type { Locale } from "@/i18n/routing";
import { monthKey } from "@/lib/archive";
import { claimable } from "@/lib/checks";
import { lastDay, ledger, salesOf } from "@/lib/line-ask-server";
import { baht } from "@/lib/money";
import { monthBooks, shareMonth } from "@/lib/month-end-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dmy } from "@/lib/thai-tax";

// An accountant's view of one month (owner, 2026-10-26: "📤 send to the accountant" in the month-end LINE report).
// No sign-in: the link's token is the key (lib/month-end-server shareMonth), read-only, that month only, until it expires.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const nameOf = (n: { th: string; en: string; ja: string }, locale: string) => (locale === "th" ? n.th || n.en : locale === "ja" ? n.ja || n.en || n.th : n.en || n.th) || "—";

export default async function SharePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("share");
  const admin = supabaseAdmin();
  const share = await shareMonth(admin, token);
  if (!share) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <p className="workspace-panel max-w-md p-6 text-center text-[15px]">{t("expired")}</p>
      </main>
    );
  }
  const { month } = share;
  const [books, { saved, taxId }, sales] = await Promise.all([monthBooks(admin, month), ledger(admin), salesOf(admin, `${month}-01`, lastDay(month))]);
  const docs = saved.filter((d) => monthKey(d.doc) === month).sort((a, b) => a.doc.date.localeCompare(b.doc.date) || a.doc.docNo.localeCompare(b.doc.docNo));
  const byDay = new Map<string, { gross: number; vat: number }>();
  for (const r of sales) {
    const a = byDay.get(r.sale_date as string) ?? { gross: 0, vat: 0 };
    a.gross += Number(r.gross) || 0;
    a.vat += Number(r.vat) || 0;
    byDay.set(r.sale_date as string, a);
  }
  const r = books.result;
  const summary: [string, number][] = [
    [t("salesValue"), r.salesValue],
    [t("salesVat"), r.salesVat],
    [t("purchases"), r.purchasesGross],
    [t("claimable"), r.claimableVat],
    [t("vatPayable"), r.vatPayable],
    [t("whtSuppliers"), books.whtSuppliers],
    [t("whtPayroll"), books.whtPayroll],
    [t("ss"), books.socialSecurity],
    [t("profit"), r.profit],
  ];
  const base = `/api/share/${token}`;

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
      <header className="grid gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <AppMark className="size-6" />
          {books.company || "Sawadee TAX"}
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight">{t("title", { month })}</h1>
        <p className="text-sm text-muted-foreground">{t("readOnly", { date: dmy(share.expiresAt.slice(0, 10)) })}</p>
      </header>

      <section className="workspace-panel grid gap-3 p-5">
        <h2 className="font-semibold">{t("summary")}</h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {summary.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-[14px]">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold tabular-nums">{baht(v)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-1 flex flex-wrap gap-2">
          <a href={`${base}/xlsx`} className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground">
            <Download className="size-4" aria-hidden />
            {t("excel")}
          </a>
          <a href={`${base}/photos`} className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-secondary px-5 text-[14px] font-semibold text-secondary-foreground">
            <FileImage className="size-4" aria-hidden />
            {t("photos", { n: docs.length })}
          </a>
        </div>
        <p className="text-xs text-muted-foreground">{t("photosHint")}</p>
      </section>

      <section className="workspace-panel grid gap-3 p-5">
        <h2 className="font-semibold">{t("purchasesList", { n: docs.length })}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("date")}</th>
                <th className="py-2 pr-3 font-medium">{t("vendor")}</th>
                <th className="py-2 pr-3 font-medium">{t("docNo")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("net")}</th>
                <th className="py-2 pr-3 text-right font-medium">{t("vat")}</th>
                <th className="py-2 pr-3 text-center font-medium">{t("claimableCol")}</th>
                <th className="py-2 text-center font-medium">{t("photo")}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(({ id, doc }) => (
                <tr key={id} className="border-t border-border/60">
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{dmy(doc.date)}</td>
                  <td className="py-2 pr-3">
                    {nameOf(doc.seller.name, locale)}
                    <span className="block text-[11px] text-muted-foreground tabular-nums">{doc.seller.taxId}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{doc.docNo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{baht(doc.totals.net)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{baht(doc.totals.vat)}</td>
                  <td className="py-2 pr-3 text-center">{claimable(doc, taxId) ? "✓" : "—"}</td>
                  <td className="py-2 text-center">
                    <a href={`${base}/photo/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">
                      <FileImage className="size-4" aria-hidden />
                      {t("open")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-panel grid gap-3 p-5">
        <h2 className="font-semibold">{t("sales")}</h2>
        {byDay.size ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-[13px]">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t("date")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("gross")}</th>
                  <th className="py-2 text-right font-medium">{t("vat")}</th>
                </tr>
              </thead>
              <tbody>
                {[...byDay.entries()].sort().map(([d, v]) => (
                  <tr key={d} className="border-t border-border/60">
                    <td className="py-2 pr-3 tabular-nums">{dmy(d)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{baht(v.gross)}</td>
                    <td className="py-2 text-right tabular-nums">{baht(v.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noSales")}</p>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">{t("note")}</p>
    </main>
  );
}
