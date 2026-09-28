"use client";

// One vendor's automatic registration rule: category and payment to always use, and (admins only) "save
// without asking" for documents that pass every automatic check. Changes are saved at once.

import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMe } from "@/lib/role-store";
import { PAYMENTS } from "@/lib/types";
import { saveVendorRule } from "@/lib/vendor-store";
import type { Vendor } from "@/lib/vendors";
import { useCategoryOptions } from "./CategoryIcon";

const NONE = "none";

export function VendorRule({ v }: { v: Vendor }) {
  const categoryOptions = useCategoryOptions(v.ruleCategory ?? undefined);
  const t = useTranslations();
  const isAdmin = useMe().role === "admin";
  const [busy, setBusy] = useState(false);

  const save = async (patch: Parameters<typeof saveVendorRule>[1]) => {
    setBusy(true);
    try {
      await saveVendorRule(v.id, patch);
      toast.success(t("vendors.ruleSaved"));
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2 rounded-2xl bg-muted/50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Wand2 className="size-3.5" aria-hidden />
        {t("vendors.rule")}
      </p>
      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
        <div className="grid min-w-0 gap-1">
          <span className="px-1 text-[11px] text-muted-foreground">
            {t("app.category")}
          </span>
          <Select
            value={v.ruleCategory ?? NONE}
            disabled={busy}
            onValueChange={(x) =>
              void save({ rule_category: x === NONE ? null : x })
            }
          >
            <SelectTrigger
              size="sm"
              className="h-9 w-full min-w-0 bg-background sm:w-auto sm:min-w-36"
              aria-label={t("app.category")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("vendors.ruleNone")}</SelectItem>
              {categoryOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1">
          <span className="px-1 text-[11px] text-muted-foreground">
            {t("app.payment")}
          </span>
          <Select
            value={v.rulePayment ?? NONE}
            disabled={busy}
            onValueChange={(x) =>
              void save({ rule_payment: x === NONE ? null : x })
            }
          >
            <SelectTrigger
              size="sm"
              className="h-9 w-full min-w-0 bg-background sm:w-auto sm:min-w-36"
              aria-label={t("app.payment")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("vendors.ruleNone")}</SelectItem>
              {PAYMENTS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`payment.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm sm:ml-auto">
          <Switch
            checked={v.autoRegister}
            disabled={busy || !isAdmin}
            onCheckedChange={(on) => void save({ auto_register: on })}
          />
          {t("vendors.ruleAuto")}
        </label>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {isAdmin ? t("vendors.ruleHint") : t("vendors.ruleHintStaff")}
      </p>
    </div>
  );
}
