"use client";

// After a save: when the vendor's last three saved documents share the same category and payment, offer to make it
// a rule ("앞으로 자동으로 할까요?"). Admins also get automatic registration switched on; staff only the rule.

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useMe } from "@/lib/role-store";
import type { LedgerDoc } from "@/lib/types";
import { ruleSuggestionFor, saveVendorRule } from "@/lib/vendor-store";
import type { Category, Payment } from "@/lib/types";

export function useOfferRule(): (doc: LedgerDoc) => Promise<void> {
  const t = useTranslations();
  const isAdmin = useMe().role === "admin";
  return async (doc) => {
    const s = await ruleSuggestionFor(doc);
    if (!s) return;
    const name = s.vendor.name.en || s.vendor.name.th || s.vendor.name.ja || s.vendor.taxId;
    toast(
      t("vendors.ruleOffer", {
        name,
        category: t(`category.${s.rule.category as Category}`),
        payment: t(`payment.${s.rule.payment as Payment}`),
      }),
      {
        duration: 12000,
        action: {
          label: t("vendors.ruleOfferYes"),
          onClick: () => {
            void saveVendorRule(s.vendor.id, {
              rule_category: s.rule.category,
              rule_payment: s.rule.payment,
              ...(isAdmin ? { auto_register: true } : {}),
            })
              .then(() => toast.success(isAdmin ? t("vendors.ruleSavedAuto") : t("vendors.ruleSaved")))
              .catch(() => toast.error(t("app.saveFail")));
          },
        },
      },
    );
  };
}
