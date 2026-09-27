"use client";

// Pick the seller from the vendor directory: name, tax ID, address, branch and phone are filled in one go,
// plus the category/payment last saved for that vendor — so a known vendor needs no typing in three languages.

import { Building2, Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportLang } from "@/lib/export";
import { digitsOnly } from "@/lib/thai-tax";
import type { LedgerDoc, Tri } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useVendors, vendorHistory } from "@/lib/vendor-store";
import { pickVendor, type Vendor } from "@/lib/vendors";

export function VendorPicker() {
  const t = useTranslations("vendors");
  const lang = exportLang(useLocale());
  const { vendors, loaded } = useVendors();
  const { control, getValues, setValue } = useFormContext<LedgerDoc>();
  const taxId = useWatch({ control, name: "seller.taxId" });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const label = (n: Tri) => n[lang] || n.th || n.en || n.ja;
  const current = vendors.find((v) => v.taxId === digitsOnly(taxId ?? ""));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vendors;
    return vendors.filter((v) => [v.name.th, v.name.en, v.name.ja, v.taxId].some((x) => x.toLowerCase().includes(s)));
  }, [vendors, q]);

  const choose = async (v: Vendor) => {
    setBusy(v.id);
    const doc = pickVendor(getValues(), v, await vendorHistory(v.id));
    const opts = { shouldDirty: true };
    setValue("seller", doc.seller, opts);
    setValue("category", doc.category, opts);
    setValue("payment", doc.payment, opts);
    setBusy(null);
    setOpen(false);
    setQ("");
    toast.success(t("pickFilled", { name: label(v.name) }));
  };

  return (
    <div className="workspace-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-sm print:hidden">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Building2 className="size-4" aria-hidden />
        {t("pickLabel")}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="press flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border bg-background px-3 text-left sm:max-w-md"
          >
            <span className={cn("truncate", !current && "text-muted-foreground")}>{current ? label(current.name) : t("pick")}</span>
            <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2" data-lenis-prevent>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pickSearch")} className="h-10 pl-9" />
          </div>
          <ul className="max-h-72 overflow-y-auto overscroll-contain" role="listbox" aria-label={t("pickLabel")}>
            {!loaded ? (
              <li className="flex justify-center py-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></li>
            ) : shown.length === 0 ? (
              <li className="px-3 py-6 text-center text-muted-foreground">{t("pickEmpty")}</li>
            ) : (
              shown.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={current?.id === v.id}
                    disabled={!!busy}
                    onClick={() => void choose(v)}
                    className="tap-row flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">{label(v.name)}</span>
                      <span className="truncate text-xs text-muted-foreground tabular-nums">{v.taxId}</span>
                    </span>
                    {busy === v.id ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      current?.id === v.id && <Check className="size-4 text-primary" aria-hidden />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
      <span className="w-full text-[11px] leading-snug text-muted-foreground">{t("pickHint")}</span>
    </div>
  );
}
