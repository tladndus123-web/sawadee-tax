"use client";

// Expense claims (owner, 2026-10-28): staff snap what they paid for the shop and claim it back; admins approve,
// reject, and pay back — the receipt then goes into the ledger by itself. Staff see their own claims; admins see
// everyone's, who is owed how much, and the settings (what may be claimed, self-approval under an amount, photo
// needed, LINE). lib/expenses has the rules, lib/expense-store the data.

import { Check, ChevronRight, CircleCheck, HandCoins, Image as ImageIcon, Layers, Loader2, Pencil, Plus, Receipt, Settings2, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryIcon, useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { Link } from "@/i18n/navigation";
import { useCompany } from "@/lib/company-store";
import { claimPhotoUrls, decideClaims, payClaims, removeClaim, useClaims } from "@/lib/expense-store";
import { fullAdmin } from "@/lib/screens";
import { claimFlags, type Flag } from "@/lib/expense-checks";
import { type Claim, type ClaimStatus, claimSummary, owed, PAID_HOW, type PaidHow } from "@/lib/expenses";
import { knownPhotos } from "@/lib/ledger-store";
import { baht, fromSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { ClaimDetail, firstItem } from "./ClaimDetail";
import { ClaimDialog } from "./ClaimDialog";
import { ExpenseOverview } from "./ExpenseOverview";
import { ExpenseSettingsPanel } from "./ExpenseSettingsPanel";
import { QuickReview } from "./QuickReview";

type Tab = "pending" | "approved" | "paid" | "rejected" | "all";
const STATUS_TONE: Record<ClaimStatus, string> = {
  pending: "bg-warn-soft text-warn",
  approved: "bg-primary/10 text-primary",
  paid: "bg-ok-soft text-ok",
  rejected: "bg-muted text-muted-foreground",
};

export function ExpensesPage() {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const me = useMe();
  const isAdmin = me.role === "admin";
  const { claims, loaded } = useClaims();
  const [tab, setTab] = useState<Tab>("pending");
  const [editing, setEditing] = useState<Claim | null | "new">(null);
  const [paying, setPaying] = useState<Claim[] | null>(null);
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayBangkok();
  const sum = claimSummary(claims, today.slice(0, 7));
  const owe = useMemo(() => owed(claims), [claims]);
  // What to look at before approving (admins): same receipt twice, personal things, amounts that differ …
  const [ledgerPhotos, setLedgerPhotos] = useState<{ id: string; hash: string }[]>([]);
  useEffect(() => {
    if (isAdmin) void knownPhotos().then((k) => setLedgerPhotos(k.map((x) => ({ id: x.id, hash: x.hash }))));
  }, [isAdmin, claims.length]);
  const flags = useMemo(() => new Map(claims.map((c) => [c.id, isAdmin ? claimFlags(c, { claims, ledgerPhotos }) : []])), [claims, ledgerPhotos, isAdmin]);
  const mine = isAdmin ? claims : claims.filter((c) => c.userId === me.userId);
  const list = tab === "all" ? mine : mine.filter((c) => c.status === tab);
  const count = (s: Tab) => (s === "all" ? mine.length : mine.filter((c) => c.status === s).length);
  // The AI's one-line notes per claim (from the month's report), the quick review, the receipt thumbnails
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbKey = list.map((c) => c.photoPath ?? "").join("|");
  useEffect(() => {
    const paths = list.map((c) => c.photoPath).filter((x): x is string => !!x && !thumbs[x]);
    if (paths.length) void claimPhotoUrls(paths).then((m) => setThumbs((cur) => ({ ...cur, ...m })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the shown photos change
  }, [thumbKey]);
  const flagText = useFlagText();
  const pendingList = mine.filter((c) => c.status === "pending");
  const dayLabel = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const approve = async (ids: string[]) => {
    setBusy(true);
    try {
      await decideClaims(ids, "approved");
      toast.success(t("approved"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">{isAdmin ? t("subAdmin") : t("subStaff")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button type="button" variant="ghost" className="h-11 rounded-full px-4" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
              <Settings2 className="size-4" />
              {t("settings")}
            </Button>
          )}
          {isAdmin && pendingList.length > 0 && (
            <Button type="button" variant="secondary" className="h-11 rounded-full px-4" onClick={() => setQuick(true)}>
              <Layers className="size-4" />
              {t("quick.open", { n: pendingList.length })}
            </Button>
          )}
          <Button type="button" className="h-11 rounded-full px-5" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t("new")}
          </Button>
        </div>
      </header>

      {/* Admins: the month at a glance and the AI's read of it */}
      {isAdmin && <ExpenseOverview claims={claims} month={today.slice(0, 7)} canAi={fullAdmin(me)} onNotes={setNotes} />}

      {showSettings && isAdmin && <ExpenseSettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Admins: what waits and who is owed */}
      {isAdmin && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label={t("summary")}>
          <button type="button" onClick={() => setTab("pending")} className="workspace-panel grid gap-0.5 p-4 text-left">
            <span className="text-[13px] text-muted-foreground">{t("sumPending")}</span>
            <b className="text-[26px] leading-tight font-semibold text-warn tabular-nums">{t("countN", { n: sum.pending })}</b>
          </button>
          <button type="button" onClick={() => setTab("approved")} className="workspace-panel grid gap-0.5 p-4 text-left">
            <span className="text-[13px] text-muted-foreground">{t("sumOwed")}</span>
            <b className="text-[26px] leading-tight font-semibold text-primary tabular-nums">{baht(fromSatang(sum.owed))}</b>
          </button>
          <div className="workspace-panel grid gap-0.5 p-4">
            <span className="text-[13px] text-muted-foreground">{t("sumPaid")}</span>
            <b className="text-[26px] leading-tight font-semibold tabular-nums">{baht(fromSatang(sum.paid))}</b>
          </div>
        </section>
      )}
      {isAdmin && owe.length > 0 && (
        <section className="workspace-panel grid gap-2 p-4 sm:p-5" aria-labelledby="owed-title">
          <h2 id="owed-title" className="flex items-center gap-2 text-[15px] font-semibold">
            <HandCoins className="size-4 text-primary" aria-hidden />
            {t("owedTitle")}
          </h2>
          <ul className="grid gap-2">
            {owe.map((o) => (
              <li key={o.userId ?? o.name} className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3">
                <span className="grid size-9 flex-none place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">{(o.name || "?").slice(0, 1)}</span>
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-[15px]">{o.name}</b>
                  <span className="text-[12px] text-muted-foreground">{t("owedCount", { n: o.ids.length })}</span>
                </span>
                <b className="text-[18px] tabular-nums">{baht(fromSatang(o.amount))}</b>
                <Button type="button" className="h-9 rounded-full px-4" onClick={() => setPaying(claims.filter((c) => o.ids.includes(c.id)))}>
                  <Check className="size-4" />
                  {t("paidBack")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("show")}>
        {(["pending", "approved", "paid", "rejected", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={tab === s}
            onClick={() => setTab(s)}
            className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium", tab === s ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}
          >
            {t(`tab.${s}`)}
            <span className="ml-1.5 tabular-nums opacity-70">{count(s)}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
      ) : list.length === 0 ? (
        <section className="workspace-panel grid justify-items-center gap-3 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="size-7" aria-hidden />
          </span>
          <p className="text-[15px] text-muted-foreground">{tab === "pending" ? (isAdmin ? t("emptyAdmin") : t("emptyStaff")) : t("emptyTab")}</p>
          {!isAdmin && (
            <Button type="button" className="h-11 rounded-full px-5" onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          )}
        </section>
      ) : (
        <ul className="workspace-panel divide-y divide-border overflow-hidden p-0">
          {list.map((c) => (
            <ClaimRow
              key={c.id}
              c={c}
              isAdmin={isAdmin}
              mine={c.userId === me.userId}
              busy={busy}
              day={dayLabel(c.day)}
              flags={c.status === "pending" || c.status === "approved" ? (flags.get(c.id) ?? []) : []}
              thumb={c.photoPath ? thumbs[c.photoPath] : undefined}
              note={isAdmin && (c.status === "pending" || c.status === "approved") ? notes[c.id] : undefined}
              flagText={flagText}
              onApprove={() => void approve([c.id])}
              onReject={() => setRejecting(c)}
              onPay={() => setPaying([c])}
              onEdit={() => setEditing(c)}
            />
          ))}
        </ul>
      )}

      {editing && <ClaimDialog claim={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {paying && <PayDialog claims={paying} onClose={() => setPaying(null)} />}
      {rejecting && <RejectDialog claim={rejecting} onClose={() => setRejecting(null)} />}
      {quick && <QuickReview claims={pendingList} flags={flags} notes={notes} flagText={flagText} onClose={() => setQuick(false)} />}
    </div>
  );
}

function ClaimRow({
  c,
  isAdmin,
  mine,
  busy,
  day,
  flags,
  onApprove,
  onReject,
  onPay,
  onEdit,
  thumb,
  note,
  flagText,
}: {
  c: Claim;
  flags: Flag[];
  /** The receipt photo, small (signed link) */
  thumb?: string;
  /** The AI's one line on this claim */
  note?: string;
  flagText: (f: Flag) => string;
  isAdmin: boolean;
  mine: boolean;
  busy: boolean;
  day: string;
  onApprove: () => void;
  onReject: () => void;
  onPay: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  // The receipt and what was bought, in full
  const [open, setOpen] = useState(false);
  const bought = firstItem(c.doc, locale);
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      {open && <ClaimDetail c={c} isAdmin={isAdmin} onClose={() => setOpen(false)} />}
      <button type="button" onClick={() => setOpen(true)} className="-m-1.5 flex min-w-0 items-start gap-3 rounded-2xl p-1.5 text-left hover:bg-muted/50" aria-label={t("detail.open")}>
        {/* The receipt itself when there is a photo (its category as a badge), else the category */}
        {thumb ? (
          <span className="relative size-14 flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed link */}
            <img src={thumb} alt="" className="size-14 rounded-2xl object-cover ring-1 ring-border" loading="lazy" />
            <CategoryIcon category={c.category} className="absolute -right-1.5 -bottom-1.5 size-6 rounded-lg ring-2 ring-card" />
          </span>
        ) : (
          <CategoryIcon category={c.category} className="size-14" />
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[15px] font-semibold">{isAdmin ? `${c.name} · ${c.seller || catLabel(c.category)}` : c.seller || catLabel(c.category)}</p>
            <b className="flex-none text-[16px] tabular-nums">{baht(fromSatang(c.amount))}</b>
          </div>
          {bought && (
            <p className="truncate text-[13px] text-foreground/80">
              🛒 {bought.more ? t("detail.more", { name: bought.name, n: bought.more }) : bought.name}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span>{day}</span>
            {c.photoPath && (
              <span className="flex items-center gap-1 font-medium text-primary">
                · <ImageIcon className="size-3.5" aria-hidden />
                {t("detail.see")}
              </span>
            )}
            <span>· {catLabel(c.category)}</span>
            {c.note && <span className="truncate">· {c.note}</span>}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_TONE[c.status])}>{t(`st.${c.status}`)}</span>
            {c.status === "paid" && c.paidHow && <span>{t(`how.${c.paidHow}`)}</span>}
            {c.status === "rejected" && c.reason && <span className="text-bad">“{c.reason}”</span>}
            {!c.photoPath && !flags.length && <span>· {t("noPhoto")}</span>}
          </p>
          <ClaimSteps status={c.status} />
          {note && (
            <p className="mt-1 flex items-start gap-1.5 rounded-xl bg-primary/8 px-3 py-1.5 text-[12.5px] text-foreground">
              <Sparkles className="mt-0.5 size-3.5 flex-none text-primary" aria-hidden />
              {note}
            </p>
          )}
          {flags.length > 0 && (
            <ul className="mt-1 grid gap-1 rounded-xl bg-warn-soft px-3 py-2 text-[12px] text-warn">
              {flags.map((f) => (
                <li key={f.kind} className="flex items-start gap-1.5">
                  <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />
                  {flagText(f)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {isAdmin && c.status === "pending" && (
          <>
            <Button type="button" className="h-9 rounded-full px-4" disabled={busy} onClick={onApprove}>
              <Check className="size-4" />
              {t("approve")}
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-full px-4 text-bad" disabled={busy} onClick={onReject}>
              <X className="size-4" />
              {t("reject")}
            </Button>
          </>
        )}
        {isAdmin && c.status === "approved" && (
          <Button type="button" variant="outline" className="h-9 rounded-full px-4" disabled={busy} onClick={onPay}>
            <HandCoins className="size-4" />
            {t("paidBack")}
          </Button>
        )}
        {c.documentId && isAdmin && (
          <Button asChild variant="ghost" className="h-9 rounded-full px-3 text-primary">
            <Link href={`/documents/${c.documentId}`}>
              <CircleCheck className="size-4" />
              {t("inLedger")}
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
        {c.status === "pending" && (mine || isAdmin) && (
          <>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label={t("edit")} onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-bad"
              aria-label={t("remove")}
              onClick={() => {
                if (window.confirm(t("removeAsk"))) void removeClaim(c.id).catch(() => toast.error(t("fail")));
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function PayDialog({ claims, onClose }: { claims: Claim[]; onClose: () => void }) {
  const t = useTranslations("expenses");
  const company = useCompany();
  const [day, setDay] = useState(todayBangkok());
  const [how, setHow] = useState<PaidHow>("cash");
  const [busy, setBusy] = useState(false);
  const total = claims.reduce((a, c) => a + c.amount, 0);
  const pay = async () => {
    setBusy(true);
    try {
      await payClaims(claims, day, how, company.taxId);
      toast.success(t("paidDone", { n: claims.length }));
      onClose();
    } catch {
      toast.error(t("fail"));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payTitle", { name: claims[0]?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("paySub", { n: claims.length })}</DialogDescription>
        </DialogHeader>
        <p className="text-center text-[32px] font-semibold tabular-nums">{baht(fromSatang(total))}</p>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold">{t("payHow")}</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("payHow")}>
            {PAID_HOW.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={how === h}
                onClick={() => setHow(h)}
                className={cn("h-11 rounded-xl border text-[14px] font-medium", how === h ? "border-primary bg-primary/10 text-primary" : "border-border")}
              >
                {t(`how.${h}`)}
              </button>
            ))}
          </div>
          {how === "payroll" && <p className="text-[12px] text-muted-foreground">{t("payrollNote")}</p>}
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">{t("payDay")}</span>
          <DateInput value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
        </label>
        <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">{t("payLedger")}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" className="h-11 rounded-full px-6" disabled={busy || !day} onClick={() => void pay()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("paidBack")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const t = useTranslations("expenses");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rejectTitle")}</DialogTitle>
          <DialogDescription>
            {claim.name} · {baht(fromSatang(claim.amount))}
          </DialogDescription>
        </DialogHeader>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("rejectPh")} className="h-11" autoFocus />
        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-full px-6"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await decideClaims([claim.id], "rejected", reason);
                toast.success(t("rejected"));
                onClose();
              } catch {
                toast.error(t("fail"));
                setBusy(false);
              }
            }}
          >
            {t("reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How a check reads on screen (the list and the quick review) */
function useFlagText() {
  const t = useTranslations("expenses");
  return (f: Flag) =>
    f.kind === "mismatch"
      ? t("flag.mismatch", { amount: baht(fromSatang(f.n ?? 0)) })
      : f.kind === "old"
        ? t("flag.old", { n: f.n ?? 0 })
        : f.kind === "big"
          ? t("flag.big", { amount: baht(fromSatang(f.n ?? 0)) })
          : f.kind === "personal"
            ? t("flag.personal", { word: f.word ?? "" })
            : t(`flag.${f.kind}`);
}

/** Sent → approved → paid back (or sent → rejected), as three small steps */
function ClaimSteps({ status }: { status: ClaimStatus }) {
  const t = useTranslations("expenses.steps");
  const reached = status === "pending" ? 1 : status === "approved" ? 2 : status === "paid" ? 3 : 1;
  const steps = status === "rejected" ? (["sent", "rejected"] as const) : (["sent", "approved", "paid"] as const);
  return (
    <ol className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold" aria-label={t("label")}>
      {steps.map((s, i) => {
        const on = status === "rejected" ? true : i < reached;
        const bad = s === "rejected";
        return (
          <li key={s} className="flex items-center gap-1">
            {i > 0 && <span className={cn("h-0.5 w-4 rounded-full", on ? (bad ? "bg-bad/50" : "bg-primary/60") : "bg-border")} aria-hidden />}
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5", on ? (bad ? "bg-bad-soft text-bad" : "bg-primary/10 text-primary") : "bg-muted text-muted-foreground")}>
              {on && !bad && <Check className="size-3" aria-hidden />}
              {t(s)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
