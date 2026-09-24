"use client";

import { Building2, Loader2, LogOut, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCompany, useCompany } from "@/lib/company-store";
import { type Role, saveMyName, signOut, useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { digitsOnly, taxIdOk } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

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

interface Member {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

/** Admin: members list, roles and invitations */
export function MembersCard() {
  const t = useTranslations();
  const locale = useLocale();
  const me = useMe();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabaseBrowser().from("members").select("user_id, email, name, role, created_at").order("created_at");
    setMembers((data as Member[]) ?? []);
  };
  useEffect(() => {
    if (me.role === "admin") void load();
  }, [me.role]);
  if (me.role !== "admin") return null;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role, locale }) });
    setBusy(false);
    if (res.ok) {
      toast.success(t("members.invited", { email }));
      setEmail("");
      void load();
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(t("members.inviteFail", { reason: error ?? res.status }));
    }
  };

  const changeRole = async (m: Member, next: Role) => {
    const { error } = await supabaseBrowser().from("members").update({ role: next }).eq("user_id", m.user_id);
    if (error) toast.error(/admin is required/.test(error.message) ? t("members.lastAdmin") : error.message);
    else toast.success(t("members.roleChanged"));
    void load();
  };

  return (
    <section aria-labelledby="members-title" className={card}>
      <div className="grid gap-1">
        <h2 id="members-title" className={title}>
          <UserPlus className="size-5 text-primary" aria-hidden />
          {t("members.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("members.hint")}</p>
      </div>
      <ul className="grid divide-y rounded-xl border">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {m.name || m.email}
                {m.user_id === me.userId && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t("members.you")}</span>}
              </span>
              {m.name && <span className="block truncate text-xs text-muted-foreground">{m.email}</span>}
            </span>
            <select
              value={m.role}
              onChange={(e) => void changeRole(m, e.target.value as Role)}
              aria-label={`${m.email} · ${t("members.title")}`}
              className={cn("h-9 rounded-full border bg-card px-3 text-sm", m.role === "admin" && "font-semibold text-primary")}
            >
              <option value="admin">{t("role.admin")}</option>
              <option value="staff">{t("role.staff")}</option>
            </select>
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-56 flex-1 gap-1.5">
          <span className="text-xs text-muted-foreground">{t("members.inviteEmail")}</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </label>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={t("role.staff")} className="h-10 rounded-full border bg-card px-3 text-sm">
          <option value="staff">{t("role.staff")}</option>
          <option value="admin">{t("role.admin")}</option>
        </select>
        <Button type="submit" className="h-10 rounded-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {t("members.invite")}
        </Button>
      </form>
    </section>
  );
}
