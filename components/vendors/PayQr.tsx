"use client";

// Paying a vendor: their PromptPay QR with the amount filled in (any Thai banking app scans it), and their bank
// account with copy buttons. lib/promptpay builds the QR text; the vendor's details are set by admins.

import { Check, Copy, Landmark } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { baht } from "@/lib/money";
import { bankName, promptPayKind, promptPayPayload } from "@/lib/promptpay";
import type { VendorPay } from "@/lib/vendors";

export const canPay = (p: VendorPay) => !!promptPayKind(p.promptpay) || !!p.account;

export function PayQr({ pay, amount, withheld }: { pay: VendorPay; amount?: number; withheld?: number }) {
  const t = useTranslations("pay2");
  const locale = useLocale();
  const [svg, setSvg] = useState<string | null>(null);
  const kind = promptPayKind(pay.promptpay);

  useEffect(() => {
    if (!kind) return;
    let live = true;
    void QRCode.toString(promptPayPayload(pay.promptpay, amount), { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [pay.promptpay, amount, kind]);

  return (
    <div className="grid gap-4">
      {kind && (
        <figure className="grid justify-items-center gap-2">
          {/* The QR is drawn from our own text (lib/promptpay), never from what a page or a person typed in as markup */}
          <div className="size-56 rounded-2xl bg-white p-2 ring-1 ring-border [&>svg]:size-full" aria-label={t("qr")} role="img" dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
          <figcaption className="grid justify-items-center gap-0.5 text-center">
            {amount ? <span className="text-2xl font-bold tracking-tight tabular-nums">{baht(amount)}</span> : <span className="text-sm text-muted-foreground">{t("noAmount")}</span>}
            {amount && withheld ? <span className="text-xs font-medium text-brand tabular-nums">{t("withheld", { amount: baht(withheld) })}</span> : null}
            <span className="text-xs text-muted-foreground">
              PromptPay · <span className="mono">{pay.promptpay}</span>
              {pay.name && ` · ${pay.name}`}
            </span>
          </figcaption>
        </figure>
      )}
      {pay.account && (
        <div className="grid gap-2 rounded-2xl bg-muted/50 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Landmark className="size-3.5" aria-hidden />
            {t("bankTitle")}
          </p>
          <CopyRow label={t("bank")} value={pay.bank ? bankName(pay.bank, locale) : "–"} copy={false} />
          <CopyRow label={t("account")} value={pay.account} mono />
          {pay.name && <CopyRow label={t("accountName")} value={pay.name} />}
          {amount ? <CopyRow label={t("amount")} value={amount.toFixed(2)} mono /> : null}
        </div>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">{t("checkName")}</p>
    </div>
  );
}

function CopyRow({ label, value, mono, copy = true }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  const t = useTranslations("pay2");
  const [done, setDone] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(t("copied"));
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error(t("copyFail"));
    }
  };
  return (
    <div className="flex min-h-10 items-center gap-2">
      <span className="w-20 flex-none text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "mono min-w-0 flex-1 truncate text-[15px] font-semibold" : "min-w-0 flex-1 truncate text-sm font-medium"}>{value}</span>
      {copy && (
        <button type="button" onClick={() => void doCopy()} className="press grid size-10 flex-none place-items-center rounded-full hover:bg-muted" aria-label={t("copy", { what: label })}>
          {done ? <Check className="size-4 text-ok" /> : <Copy className="size-4 text-muted-foreground" />}
        </button>
      )}
    </div>
  );
}
