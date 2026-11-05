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
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{me.owner ? t("role.owner") : t(`role.${me.role}`)}</span>
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

/** Our company: tax ID (drives "buyer is our company" and input-VAT claimability), and the name, address and branch
 *  number the payslips and filing lists print (owner, 2026-11-06: "설정에서 회사 상호 주소 입력하게") */
export function CompanyCard() {
  const t = useTranslations();
  const me = useMe();
  const company = useCompany();
  const fromCompany = () => ({ taxId: company.taxId, nameTh: company.name.th, nameEn: company.name.en, addrTh: company.address.th, addrEn: company.address.en, branch: company.branch });
  const [f, setF] = useState(fromCompany);
  useEffect(() => setF(fromCompany()), [company]); // eslint-disable-line react-hooks/exhaustive-deps -- reload on change
  const [busy, setBusy] = useState(false);
  const admin = me.role === "admin";
  const valid = !f.taxId || taxIdOk(f.taxId);
  const branchOk = !f.branch || /^\d{5}$/.test(f.branch);
  const changed = JSON.stringify(f) !== JSON.stringify(fromCompany());
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: k === "taxId" || k === "branch" ? digitsOnly(e.target.value) : e.target.value }));
  const field = (k: keyof typeof f, label: string, extra?: { wide?: boolean; mono?: boolean; max?: number; area?: boolean; placeholder?: string; bad?: boolean }) => (
    <label className={extra?.wide ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {extra?.area ? (
        <textarea
          value={f[k]}
          disabled={!admin}
          rows={2}
          maxLength={300}
          onChange={set(k)}
          placeholder={extra.placeholder}
          className="min-h-16 w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        />
      ) : (
        <Input
          value={f[k]}
          disabled={!admin}
          inputMode={extra?.mono ? "numeric" : undefined}
          maxLength={extra?.max ?? 160}
          onChange={set(k)}
          placeholder={extra?.placeholder}
          aria-invalid={extra?.bad}
          className={extra?.mono ? "mono h-10" : "h-10"}
        />
      )}
    </label>
  );
  return (
    <section aria-labelledby="company-title" className={card}>
      <h2 id="company-title" className={title}>
        <Building2 className="size-5 text-primary" aria-hidden />
        {t("app.settings")}
      </h2>
      <p className="-mt-2 text-[13px] text-muted-foreground">{t("app.companyHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("nameTh", t("app.companyNameTh"), { placeholder: "บริษัท ... จำกัด" })}
        {field("nameEn", t("app.companyNameEn"), { placeholder: "... Co., Ltd." })}
        {field("taxId", t("app.companyTax"), { mono: true, max: 13, bad: !valid })}
        {field("branch", t("app.companyBranch"), { mono: true, max: 5, placeholder: "00000", bad: !branchOk })}
        {field("addrTh", t("app.companyAddrTh"), { wide: true, area: true })}
        {field("addrEn", t("app.companyAddrEn"), { wide: true, area: true })}
      </div>
      {!valid && <p className="text-xs text-bad">{t("detail.invalid")}</p>}
      {!branchOk && <p className="text-xs text-bad">{t("app.companyBranchBad")}</p>}
      {admin ? (
        <Button
          type="button"
          className="h-10 w-fit rounded-full px-5"
          disabled={!valid || !branchOk || !changed || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saveCompany({
                tax_id: f.taxId,
                name: { th: f.nameTh.trim(), en: f.nameEn.trim(), ja: "" },
                address: { th: f.addrTh.trim(), en: f.addrEn.trim() },
                branch: f.branch,
              });
              toast.success(t("app.companySaved"));
            } catch {
              toast.error(t("app.companySaveFail"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("app.companySave")}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>
      )}
    </section>
  );
}
