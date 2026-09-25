"use client";

import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCompany, useCompany } from "@/lib/company-store";
import { saveMyName, signOut, useMe } from "@/lib/role-store";
import { digitsOnly, taxIdOk } from "@/lib/thai-tax";

const card = "workspace-panel grid gap-4 p-5 sm:p-6";
const title = "flex items-center gap-2 text-lg font-semibold tracking-tight";

/** My name and sign-out */
export function AccountCard() {
  const t = useTranslations();
  const me = useMe();
  const [name, setName] = useState(me.name);
  useEffect(() => setName(me.name), [me.name]);
  return (
    <section aria-labelledby="account-title" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-title" className={title}>
          {me.role === "admin" ? <ShieldCheck className="size-5 text-primary" aria-hidden /> : <UserRound className="size-5 text-muted-foreground" aria-hidden />}
          {t("auth.account")}
        </h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{t(`role.${me.role}`)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{me.email}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-56 flex-1 gap-1.5">
          <span className="text-xs text-muted-foreground">{t("members.myName")}</span>
          <Input value={name} maxLength={40} placeholder={t("members.namePh")} onChange={(e) => setName(e.target.value)} className="h-10" />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="h-10 rounded-full"
          disabled={name.trim() === me.name}
          onClick={async () => {
            await saveMyName(name);
            toast.success(t("members.nameSaved"));
          }}
        >
          {t("app.companySave")}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          {t("nav.signOut")}
        </Button>
      </div>
    </section>
  );
}

/** Our company tax ID: drives "buyer is our company" and input-VAT claimability */
export function CompanyCard() {
  const t = useTranslations();
  const me = useMe();
  const company = useCompany();
  const [taxId, setTaxId] = useState(company.taxId);
  useEffect(() => setTaxId(company.taxId), [company.taxId]);
  const valid = taxIdOk(taxId);
  return (
    <section aria-labelledby="company-title" className={card}>
      <h2 id="company-title" className={title}>
        <Building2 className="size-5 text-primary" aria-hidden />
        {t("app.settings")}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-56 flex-1 gap-1.5">
          <span className="text-xs text-muted-foreground">{t("app.companyTax")}</span>
          <Input
            value={taxId}
            inputMode="numeric"
            maxLength={13}
            disabled={me.role !== "admin"}
            onChange={(e) => setTaxId(digitsOnly(e.target.value))}
            aria-invalid={!!taxId && !valid}
            className="mono h-10"
          />
        </label>
        {me.role === "admin" && (
          <Button
            type="button"
            className="h-10 rounded-full"
            disabled={!valid || taxId === company.taxId}
            onClick={async () => {
              await saveCompany({ tax_id: taxId });
              toast.success(t("app.companySaved"));
            }}
          >
            {t("app.companySave")}
          </Button>
        )}
      </div>
      {!!taxId && !valid && <p className="text-xs text-bad">{t("detail.invalid")}</p>}
      {me.role !== "admin" && <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>}
    </section>
  );
}
