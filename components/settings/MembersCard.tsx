"use client";

import { Ban, Crown, Eye, Loader2, Lock, Mail, MessageCircle, MoreHorizontal, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { SCREENS, type Screen } from "@/lib/screens";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useBranchName } from "@/components/layout/branch-switcher";
import { branchLabel } from "@/lib/branches";
import { useBranches } from "@/lib/branch-store";
import { type Role, useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BranchPins } from "./BranchCard";
import { useFoldStatus } from "./SettingsFold";

interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** Above admins (supabase …003200_owners.sql) */
  owner: boolean;
  /** The screens an owner lets this admin open (null = all) */
  adminScreens: string[] | null;
  homeBranch: string | null;
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
  const tf = useTranslations("fold");
  useFoldStatus(members ? tf("members", { count: members.length }) : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  // Branches a staff member is kept out of (it looks locked to them; no password opens it) — admins only
  const [blocks, setBlocks] = useState<{ userId: string; branchId: string }[]>([]);
  const [blocking, setBlocking] = useState<Member | null>(null);
  const [screening, setScreening] = useState<Member | null>(null);
  // Owners alone keep people out of branches, set admins' screens and make admins (the database checks the same)
  const isOwner = me.owner;
  const { branches } = useBranches();
  const names = useBranchName();

  const load = useCallback(async () => {
    const [res, kept] = await Promise.all([fetch("/api/members"), supabaseBrowser().from("member_branch_blocks").select("user_id, branch_id")]);
    if (res.ok) setMembers(((await res.json()) as { members: Member[] }).members);
    setBlocks((kept.data ?? []).map((r) => ({ userId: r.user_id as string, branchId: r.branch_id as string })));
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
    if (error) toast.error(/admin is required/.test(error.message) ? t("members.lastAdmin") : /only owners/.test(error.message) ? t("members.ownerOnly") : error.message);
    else toast.success(t("members.roleChanged"));
    void load();
  };

  const changeOwner = async (m: Member, next: boolean) => {
    const { error } = await supabaseBrowser().from("members").update({ owner: next }).eq("user_id", m.userId);
    if (error) toast.error(/owner is required/.test(error.message) ? t("members.lastOwner") : /only owners/.test(error.message) ? t("members.ownerOnly") : error.message);
    else toast.success(t("members.roleChanged"));
    void load();
  };

  // Their usual branch: first in the branch list after signing in, with its PIN box open
  const changeHome = async (m: Member, next: string) => {
    const { error } = await supabaseBrowser().from("members").update({ home_branch: next || null }).eq("user_id", m.userId);
    if (error) toast.error(error.message);
    else toast.success(t("members.homeChanged"));
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
                      {m.owner && (
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                          <Crown className="size-3" aria-hidden />
                          {t("role.owner")}
                        </span>
                      )}
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
                      {blocks
                        .filter((k) => k.userId === m.userId)
                        .map((k) => branches.find((b) => b.id === k.branchId))
                        .filter((b) => !!b)
                        .map((b) => (
                          <span key={b!.id} className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 font-semibold text-bad">
                            <Ban className="size-3" aria-hidden />
                            {t("members.blockedBadge", { branch: branchLabel(b!, names) })}
                          </span>
                        ))}
                      {m.role === "admin" && !m.owner && m.adminScreens && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                          <Eye className="size-3" aria-hidden />
                          {t("members.screensBadge", { count: m.adminScreens.length })}
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
                  {branches.length > 1 && (
                    <select
                      value={m.homeBranch ?? ""}
                      onChange={(e) => void changeHome(m, e.target.value)}
                      aria-label={t("members.homeOf", { name })}
                      title={t("members.homeHint")}
                      className={cn("h-10 max-w-[10rem] rounded-full border bg-card px-3 text-sm", !m.homeBranch && "text-muted-foreground")}
                    >
                      <option value="">{t("members.noHome")}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {branchLabel(b, names)}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={m.role}
                    disabled={!isOwner && (m.role === "admin" || m.owner)}
                    title={!isOwner && m.role === "admin" ? t("members.ownerOnly") : undefined}
                    onChange={(e) => void changeRole(m, e.target.value as Role)}
                    aria-label={`${m.email} · ${t("members.title")}`}
                    className={cn("h-10 rounded-full border bg-card px-3 text-sm", m.role === "admin" && "font-semibold text-primary")}
                  >
                    <option value="admin" disabled={!isOwner}>
                      {t("role.admin")}
                    </option>
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
                      {isOwner && m.role === "admin" && !m.owner && (
                        <DropdownMenuItem onSelect={() => setScreening(m)} className="items-start gap-2 py-2">
                          <Eye className="mt-0.5 size-4" />
                          <span className="grid">
                            {t("members.screensMenu")}
                            <span className="text-[11px] text-muted-foreground">{t("members.screensMenuHint")}</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                      {isOwner && m.role === "admin" && !self && (
                        <DropdownMenuItem onSelect={() => void changeOwner(m, !m.owner)} className="items-start gap-2 py-2">
                          <Crown className="mt-0.5 size-4" />
                          <span className="grid">
                            {m.owner ? t("members.ownerOff") : t("members.ownerOn")}
                            <span className="text-[11px] text-muted-foreground">{t("members.ownerHint")}</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                      {isOwner && !m.owner && branches.length > 1 && (
                        <DropdownMenuItem onSelect={() => setBlocking(m)} className="items-start gap-2 py-2">
                          <Ban className="mt-0.5 size-4" />
                          <span className="grid">
                            {t("members.blockMenu")}
                            <span className="text-[11px] text-muted-foreground">{t("members.blockMenuHint")}</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                      {!self && (isOwner || (m.role !== "admin" && !m.owner)) && (
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
          {isOwner && <option value="admin">{t("role.admin")}</option>}
        </select>
        <Button type="submit" className="h-10 rounded-full" disabled={!!busy}>
          {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {t("members.invite")}
        </Button>
      </form>

      {/* The passwords for choosing a branch (everyone types them, admins too) — the same as in branch settings */}
      <details className="group grid gap-3 rounded-2xl border border-border/70 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <Lock className="size-4 text-brand" aria-hidden />
          {t("members.pinsTitle")}
          <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">{t("members.pinsOpen")}</span>
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("members.pinsHint")}</p>
        <div className="mt-2">
          <BranchPins />
        </div>
      </details>

      {blocking && (
        <BlockDialog
          member={blocking}
          branches={branches.map((b) => ({ id: b.id, label: branchLabel(b, names) }))}
          kept={blocks.filter((k) => k.userId === blocking.userId).map((k) => k.branchId)}
          onClose={() => setBlocking(null)}
          onSaved={() => (setBlocking(null), void load())}
        />
      )}

      {screening && (
        <ScreensDialog
          member={screening}
          onClose={() => setScreening(null)}
          onSaved={() => (setScreening(null), void load())}
        />
      )}

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

/**
 * Keep one staff member out of branches (owner 2026-11-04): for them a ticked branch asks for a password that never
 * opens it; nobody else notices (supabase …003000_member_branch_blocks.sql)
 */
function BlockDialog({ member, branches, kept, onClose, onSaved }: { member: Member; branches: { id: string; label: string }[]; kept: string[]; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations();
  const [on, setOn] = useState<ReadonlySet<string>>(new Set(kept));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string, checked: boolean) =>
    setOn((cur) => {
      const next = new Set(cur);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const save = async () => {
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const add = [...on].filter((id) => !kept.includes(id));
      const drop = kept.filter((id) => !on.has(id));
      if (add.length) {
        const { error } = await sb.from("member_branch_blocks").insert(add.map((branch_id) => ({ user_id: member.userId, branch_id })));
        if (error) throw error;
      }
      if (drop.length) {
        const { error } = await sb.from("member_branch_blocks").delete().eq("user_id", member.userId).in("branch_id", drop);
        if (error) throw error;
      }
      toast.success(t("members.blockSaved"));
      onSaved();
    } catch {
      toast.error(t("app.saveFail"));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.blockTitle", { name: member.name || member.email })}</DialogTitle>
          <DialogDescription>{t("members.blockHint")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5">
          {branches.map((b) => (
            <li key={b.id}>
              <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3", on.has(b.id) ? "bg-bad-soft text-bad" : "bg-muted/60")}>
                <input type="checkbox" className="size-4" checked={on.has(b.id)} onChange={(e) => toggle(b.id, e.target.checked)} />
                <span className="flex-1 text-sm font-medium">{b.label}</span>
                {on.has(b.id) && <span className="text-xs font-semibold">{t("members.blockOn")}</span>}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" className="rounded-full px-6" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("members.blockSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Which screens this admin may open (owners only; all ticked = no limit) — lib/screens */
function ScreensDialog({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations();
  const [on, setOn] = useState<ReadonlySet<Screen>>(new Set((member.adminScreens ?? SCREENS) as Screen[]));
  const [busy, setBusy] = useState(false);
  const toggle = (s: Screen, checked: boolean) =>
    setOn((cur) => {
      const next = new Set(cur);
      if (checked) next.add(s);
      else next.delete(s);
      return next;
    });
  const save = async () => {
    setBusy(true);
    const list = SCREENS.filter((s) => on.has(s));
    const { error } = await supabaseBrowser()
      .from("members")
      .update({ admin_screens: list.length === SCREENS.length ? null : list })
      .eq("user_id", member.userId);
    if (error) {
      toast.error(/only owners/.test(error.message) ? t("members.ownerOnly") : t("app.saveFail"));
      setBusy(false);
      return;
    }
    toast.success(t("members.blockSaved"));
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.screensTitle", { name: member.name || member.email })}</DialogTitle>
          <DialogDescription>{t("members.screensHint")}</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-1.5">
          {SCREENS.map((s) => (
            <li key={s}>
              <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3", on.has(s) ? "bg-brand-soft text-brand" : "bg-muted/60 text-muted-foreground")}>
                <input type="checkbox" className="size-4" checked={on.has(s)} onChange={(e) => toggle(s, e.target.checked)} />
                <span className="text-sm font-medium">{t(`nav.${s}`)}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("members.screensAlways")}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" className="rounded-full px-6" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("members.blockSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
