"use client";

import { Loader2, Mail, MessageCircle, MoreHorizontal, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type Role, useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  line: boolean;
  lastSignIn: string | null;
  joined: boolean;
  disabledAt: string | null;
  disabledBy: string | null;
  disableReason: string | null;
}

const card = "workspace-panel grid gap-4 p-5 sm:p-6";

/**
 * Admins: everyone with their status (invite accepted, last sign-in, LINE), invite, change role,
 * send a sign-in email, and remove / restore access for people who leave (app/api/members).
 */
export function MembersCard() {
  const t = useTranslations();
  const locale = useLocale();
  const me = useMe();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/members");
    if (res.ok) setMembers(((await res.json()) as { members: Member[] }).members);
  }, []);
  useEffect(() => {
    if (me.role === "admin") void load();
  }, [me.role, load]);
  if (me.role !== "admin") return null;

  const call = async (key: string, init: RequestInit) => {
    setBusy(key);
    try {
      const res = await fetch("/api/members", { ...init, headers: { "content-type": "application/json" } });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: res.ok, error: body.error ?? String(res.status) };
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await call("invite", { method: "POST", body: JSON.stringify({ email, role, locale }) });
    if (r.ok) {
      toast.success(t("members.invited", { email }));
      setEmail("");
      void load();
    } else toast.error(t("members.inviteFail", { reason: r.error }));
  };

  const act = async (m: Member, action: "email" | "enable" | "disable", reason?: string) => {
    const r = await call(`${action}:${m.userId}`, { method: "PATCH", body: JSON.stringify({ userId: m.userId, action, reason, locale }) });
    const name = m.name || m.email;
    if (!r.ok) {
      const msg = r.error === "rate" ? t("members.rate") : r.error === "self" ? t("members.self") : r.error === "lastAdmin" ? t("members.lastAdmin") : r.error;
      toast.error(action === "email" ? t("members.sendFail", { reason: msg }) : msg);
      return false;
    }
    toast.success(action === "email" ? t("members.sent", { email: m.email }) : action === "enable" ? t("members.restored", { name }) : t("members.removed", { name }));
    if (action !== "email") void load();
    return true;
  };

  const changeRole = async (m: Member, next: Role) => {
    const { error } = await supabaseBrowser().from("members").update({ role: next }).eq("user_id", m.userId);
    if (error) toast.error(/admin is required/.test(error.message) ? t("members.lastAdmin") : error.message);
    else toast.success(t("members.roleChanged"));
    void load();
  };

  const active = (members ?? []).filter((m) => !m.disabledAt);
  const removed = (members ?? []).filter((m) => m.disabledAt);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section aria-labelledby="members-title" className={card}>
      <div className="grid gap-1">
        <h2 id="members-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UserPlus className="size-5 text-primary" aria-hidden />
          {t("members.title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("members.hint")}</p>
      </div>

      {members === null ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t("common.loading")} />
      ) : (
        <>
          <p className="text-xs font-medium text-muted-foreground">{t("members.active", { count: active.length })}</p>
          <ul className="grid divide-y rounded-xl border">
            {active.map((m) => {
              const self = m.userId === me.userId;
              const name = m.name || m.email;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span className="truncate">{name}</span>
                      {self && <span className="flex-none rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t("members.you")}</span>}
                    </span>
                    {m.name && <span className="block truncate text-xs text-muted-foreground">{m.email}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {!m.joined ? (
                        <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">{t("members.pending")}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {m.lastSignIn ? t("members.lastSignIn", { when: when.format(new Date(m.lastSignIn)) }) : t("members.neverSignedIn")}
                        </span>
                      )}
                      {m.line && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#06c755]/12 px-2 py-0.5 font-medium text-[#05a847]">
                          <MessageCircle className="size-3" aria-hidden />
                          {t("members.lineLinked")}
                        </span>
                      )}
                    </span>
                  </span>
                  <select
                    value={m.role}
                    onChange={(e) => void changeRole(m, e.target.value as Role)}
                    aria-label={`${m.email} · ${t("members.title")}`}
                    className={cn("h-10 rounded-full border bg-card px-3 text-sm", m.role === "admin" && "font-semibold text-primary")}
                  >
                    <option value="admin">{t("role.admin")}</option>
                    <option value="staff">{t("role.staff")}</option>
                  </select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t("members.actions", { name })}>
                        {busy?.endsWith(m.userId) ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-xl">
                      <DropdownMenuItem onSelect={() => void act(m, "email")} className="items-start gap-2 py-2">
                        <Mail className="mt-0.5 size-4" />
                        <span className="grid">
                          {t("members.sendEmail")}
                          <span className="text-[11px] text-muted-foreground">{t("members.sendEmailHint")}</span>
                        </span>
                      </DropdownMenuItem>
                      {!self && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setRemoving(m)} className="gap-2 py-2 text-bad focus:text-bad">
                            <UserMinus className="size-4" />
                            {t("members.remove")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>

          {removed.length > 0 && (
            <details className="group rounded-xl border bg-muted/30">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                {t("members.removedList", { count: removed.length })}
              </summary>
              <ul className="grid divide-y border-t">
                {removed.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span className="truncate line-through decoration-muted-foreground/50">{m.name || m.email}</span>
                        <span className="flex-none rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">{t("members.removedBadge")}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {t("members.removedInfo", {
                          date: day.format(new Date(m.disabledAt!)),
                          by: m.disabledBy ?? "—",
                          reason: m.disableReason ?? "—",
                        })}
                      </span>
                    </span>
                    <Button type="button" variant="secondary" className="h-10 rounded-full" disabled={!!busy} onClick={() => void act(m, "enable")}>
                      {busy === `enable:${m.userId}` ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                      {t("members.restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-56 flex-1 gap-1.5">
          <span className="text-xs text-muted-foreground">{t("members.inviteEmail")}</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </label>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={t("role.staff")} className="h-10 rounded-full border bg-card px-3 text-sm">
          <option value="staff">{t("role.staff")}</option>
          <option value="admin">{t("role.admin")}</option>
        </select>
        <Button type="submit" className="h-10 rounded-full" disabled={!!busy}>
          {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {t("members.invite")}
        </Button>
      </form>

      <RemoveDialog member={removing} busy={!!busy} onClose={() => setRemoving(null)} onConfirm={async (reason) => (await act(removing!, "disable", reason)) && setRemoving(null)} />
    </section>
  );
}

function RemoveDialog({ member, busy, onClose, onConfirm }: { member: Member | null; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [member]);
  const ok = reason.trim().length >= 2;
  const presets = [t("members.presetLeft"), t("members.presetMoved"), t("members.presetMistake")];
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.removeTitle", { name: member ? member.name || member.email : "" })}</DialogTitle>
          <DialogDescription className="leading-relaxed">{t("members.removeDesc")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onConfirm(reason.trim());
          }}
        >
          <label className="grid gap-1.5">
            <span className="text-xs font-medium">{t("members.reason")}</span>
            <Input value={reason} maxLength={200} placeholder={t("members.reasonPh")} onChange={(e) => setReason(e.target.value)} className="h-10" autoFocus />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className="min-h-9 rounded-full bg-muted px-3 text-xs font-medium hover:bg-muted/70">
                {p}
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" className="rounded-full" disabled={!ok || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
              {t("members.removeConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
