"use client";

// "배달앱 정산서" on the sales screen (owner 2026-11-18, a restaurant extra): pick a GrabFood / LINE MAN / foodpanda /
// ShopeeFood / Robinhood statement (PDF, photo, CSV or Excel), the AI reads it, every figure shows in a form to check —
// with whether sales − fees − withholding comes to the payout — and saving adds the period's sales on the app's channel
// and the fees as one paid purchase in the ledger (lib/settlement-doc). When the app's days are already entered for the
// period, only the fees go in unless the person asks (no sales counted twice).

import { CircleAlert, CircleCheck, FileUp, Loader2, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/lib/company-store";
import { saveEntry } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { saveSale, useSales } from "@/lib/sales-store";
import { feeLedgerDoc } from "@/lib/settlement-doc";
import { channelOf, feesOf, PLATFORM_LABEL, PLATFORMS, type Platform, recordedSales, saleOf, type Settlement, settlementCheck } from "@/lib/settlement-read";
import { useChannelLabel } from "./channel-name";

const MONEY: (keyof Settlement)[] = ["sales", "commission", "transactionFee", "serviceFee", "shippingFee", "adsFee", "otherFees", "feeVat", "withheld", "payout"];

export function SettlementImport({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const t = useTranslations("settle");
  const chName = useChannelLabel();
  const company = useCompany();
  const { sales } = useSales({ all: true });
  const pick = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"pick" | "reading" | "check" | "saving">("pick");
  const [s, setS] = useState<Settlement | null>(null);
  const [fileName, setFileName] = useState("");
  const [addSales, setAddSales] = useState(false);

  const read = async (file: File) => {
    setFileName(file.name);
    setState("reading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/sales/settlement", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { settlement?: Settlement; error?: string };
      if (!res.ok || !body.settlement) {
        const code = ["none", "file", "noKey", "rate", "off"].includes(body.error ?? "") ? body.error : "failed";
        toast.error(t(`err.${code}` as never));
        setState("pick");
        return;
      }
      setS(body.settlement);
      setState("check");
    } catch {
      toast.error(t("err.failed"));
      setState("pick");
    }
  };

  const recorded = s ? recordedSales(sales, s, branchId) : 0;
  const save = async () => {
    if (!s) return;
    setState("saving");
    try {
      if (!recorded || addSales) await saveSale(saleOf(s, branchId));
      if (feesOf(s) > 0) await saveEntry(feeLedgerDoc(s, branchId), null, undefined, "final", company.taxId);
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("err.save"));
      setState("check");
    }
  };
  const set = (k: keyof Settlement, v: string | number) => setS((x) => (x ? { ...x, [k]: v } : x));
  const check = s ? settlementCheck(s) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && state !== "saving" && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        {(state === "pick" || state === "reading") && (
          <button
            type="button"
            disabled={state === "reading"}
            onClick={() => pick.current?.click()}
            className="press grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center hover:border-primary/50 hover:bg-primary/5 disabled:opacity-70"
          >
            {state === "reading" ? <Loader2 className="size-7 animate-spin text-primary" aria-hidden /> : <FileUp className="size-7 text-primary" aria-hidden />}
            <span className="text-[15px] font-semibold">{state === "reading" ? t("reading", { name: fileName }) : t("pick")}</span>
            <span className="text-[12.5px] text-muted-foreground">{t("pickHint")}</span>
          </button>
        )}
        <input
          ref={pick}
          type="file"
          accept="application/pdf,.pdf,image/*,.csv,.xlsx,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void read(f);
          }}
        />

        {s && (state === "check" || state === "saving") && check && (
          <div className="grid gap-3">
            <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13.5px] ${check.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
              {check.ok ? <CircleCheck className="mt-0.5 size-4 flex-none" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden />}
              <span>{check.ok ? t("checkOk", { payout: fmt(s.payout) }) : t("checkGap", { expected: fmt(check.expected), payout: fmt(s.payout), gap: fmt(check.gap) })}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-[13px]">
                <span className="text-muted-foreground">{t("f.platform")}</span>
                <select value={s.platform} onChange={(e) => set("platform", e.target.value as Platform)} className="h-11 rounded-xl border border-input bg-background px-3 text-[16px]">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-muted-foreground">{t("f.orders")}</span>
                <Input inputMode="numeric" value={String(s.orders)} onChange={(e) => set("orders", Number(e.target.value.replace(/\D/g, "")) || 0)} className="h-11 rounded-xl text-right tabular-nums" />
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-muted-foreground">{t("f.from")}</span>
                <Input type="date" value={s.periodFrom} onChange={(e) => set("periodFrom", e.target.value)} className="h-11 rounded-xl" />
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-muted-foreground">{t("f.to")}</span>
                <Input type="date" value={s.periodTo} onChange={(e) => set("periodTo", e.target.value)} className="h-11 rounded-xl" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl bg-muted/50 p-3">
              {MONEY.map((k) => (
                <label key={k} className={`grid gap-1 text-[13px] ${k === "sales" || k === "payout" ? "col-span-2 sm:col-span-1" : ""}`}>
                  <span className={k === "sales" || k === "payout" ? "font-semibold" : "text-muted-foreground"}>{t(`f.${k}` as never)}</span>
                  <Input
                    inputMode="decimal"
                    value={String(s[k] as number)}
                    onChange={(e) => set(k, Math.abs(Number(e.target.value.replace(/,/g, ""))) || 0)}
                    className="num h-11 rounded-xl bg-background text-right pointer-fine:h-10"
                  />
                </label>
              ))}
            </div>
            {recorded > 0 && (
              <div className="grid gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]">
                <span>{t("recorded", { channel: chName(channelOf(s.platform)), recorded: fmt(recorded), sales: fmt(s.sales) })}</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={addSales} onChange={(e) => setAddSales(e.target.checked)} className="size-5" />
                  {t("addSales")}
                </label>
              </div>
            )}
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {recorded > 0 && !addSales ? t("willSaveFees", { fees: fmt(feesOf(s)) }) : t("willSave", { sales: fmt(s.sales), channel: chName(channelOf(s.platform)), fees: fmt(feesOf(s)) })}
            </p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" className="h-11 rounded-full" disabled={state === "saving"} onClick={() => (setS(null), setState("pick"))}>
                {t("again")}
              </Button>
              <Button className="h-11 rounded-full px-6" disabled={state === "saving"} onClick={() => void save()}>
                {state === "saving" && <Loader2 className="size-4 animate-spin" />}
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
