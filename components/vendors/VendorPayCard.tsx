"use client";

// One vendor's payment details on the vendor page: everyone sees them (and the QR); admins set or change them.

import { Loader2, Pencil, QrCode, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { bankName, promptPayKind, THAI_BANKS } from "@/lib/promptpay";
import { useMe } from "@/lib/role-store";
import { saveVendorPay } from "@/lib/vendor-store";
import type { Vendor } from "@/lib/vendors";
import { canPay, PayQr } from "./PayQr";

export function VendorPayCard({ v, title }: { v: Vendor; title: string }) {
  const t = useTranslations("pay2");
  const locale = useLocale();
  const isAdmin = useMe().role === "admin";
  const [editing, setEditing] = useState(false);
  const [qr, setQr] = useState(false);
  const [draft, setDraft] = useState(v.pay);
  const [busy, setBusy] = useState(false);
  const has = canPay(v.pay);
  const ppBad = draft.promptpay !== "" && !promptPayKind(draft.promptpay);

  const save = async () => {
    setBusy(true);
    try {
      await saveVendorPay(v.id, {
        pay_promptpay: draft.promptpay.replace(/\D/g, ""),
        pay_bank: draft.bank,
        pay_account: draft.account.replace(/\D/g, ""),
        pay_name: draft.name.trim(),
      });
      toast.success(t("saved"));
      setEditing(false);
    } catch {
      toast.error(t("saveFail"));
    } finally {
      setBusy(false);
    }
  };

  if (!has && !isAdmin) return null;
  return (
    <div className="grid gap-2 rounded-2xl bg-muted/50 p-3">
      <div className="flex items-center gap-1">
        <p className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Wallet className="size-3.5" aria-hidden />
          {t("title")}
        </p>
        {has && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={() => setQr(true)}>
            <QrCode className="size-3.5" />
            {t("show")}
          </Button>
        )}
        {isAdmin && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={() => (setDraft(v.pay), setEditing(true))}>
            <Pencil className="size-3.5" />
            {has ? t("edit") : t("add")}
          </Button>
        )}
      </div>

      {!editing && has && (
        <p className="text-sm">
          {[v.pay.promptpay && `PromptPay ${v.pay.promptpay}`, v.pay.account && `${v.pay.bank ? bankName(v.pay.bank, locale) : ""} ${v.pay.account}`.trim(), v.pay.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {!editing && !has && <p className="text-xs text-muted-foreground">{t("empty")}</p>}

      {editing && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ppBad) void save();
          }}
        >
          <label className="grid gap-1">
            <span className="text-xs font-medium">{t("promptpay")}</span>
            <Input value={draft.promptpay} inputMode="numeric" onChange={(e) => setDraft({ ...draft, promptpay: e.target.value })} className="mono h-10 bg-background" aria-invalid={ppBad} />
            <span className={ppBad ? "text-[11px] text-bad" : "text-[11px] text-muted-foreground"}>{ppBad ? t("promptpayBad") : t("promptpayHint")}</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-medium">{t("bank")}</span>
              <select value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="">–</option>
                {THAI_BANKS.map(([code]) => (
                  <option key={code} value={code}>
                    {bankName(code, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium">{t("account")}</span>
              <Input value={draft.account} inputMode="numeric" onChange={(e) => setDraft({ ...draft, account: e.target.value })} className="mono h-10 bg-background" />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-medium">{t("accountName")}</span>
            <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10 bg-background" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="rounded-full" disabled={busy || ppBad}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      )}

      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-xs">{t("hint")}</DialogDescription>
          </DialogHeader>
          {qr && <PayQr pay={v.pay} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
