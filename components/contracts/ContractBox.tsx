"use client";

// Contract box (계약서함, 2026-11-18; ported from the for-sale version): admins keep the company's contracts with a scan
// or photo and find them again — search, kind, "ends soon" first, a D-day badge per card. Add / change in a dialog:
// drop or pick a photo / PDF → "AI가 읽기" fills the form → the person checks → save. `?new=1` (top bar "+ New") opens
// the add form at once. Pure rules: lib/contracts, lib/contract-read; storage and saving: lib/contract-store.

import { ContractAi } from "./ContractAi";
import { fullAdmin } from "@/lib/screens";
import { Briefcase, Building2, FileText, Handshake, HeartPulse, Landmark, Loader2, MessageCircle, Paperclip, Plus, Repeat, Search, ShieldCheck, Sparkles, Trash2, Truck, Upload, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Badge, DueBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readingToFields, readLangOf } from "@/lib/contract-read";
import {
  CONTRACT_FILTERS,
  CONTRACT_KINDS,
  type Contract,
  type ContractFilter,
  type ContractKind,
  checkFile,
  contractState,
  DEFAULT_NOTICE_DAYS,
  daysLeft,
  filterCounts,
  matchesFilter,
  matchesQuery,
  noticeBy,
  sortContracts,
} from "@/lib/contracts";
import { contractFileUrl, deleteContract, dropUpload, loadContracts, readContractFile, removeContractFile, saveContract, type Uploaded, uploadContractFile } from "@/lib/contract-store";
import { bahtWhole, fromSatang, toSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import { preparePhoto } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ContractKind, typeof FileText> = {
  lease: Building2,
  supply: Truck,
  service: Briefcase,
  employment: Handshake,
  loan: Landmark,
  insurance: HeartPulse,
  partnership: ShieldCheck,
  other: FileText,
};

/** "2026-03-01" in the reader's language (Thai in the Buddhist year) */
function useDay() {
  const locale = useLocale();
  return useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locale === "th" ? "th-TH" : locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)),
    [locale],
  );
}

export function ContractBox() {
  const t = useTranslations("contracts");
  const me = useMe();
  // Owners and admins an owner did not limit (lib/screens fullAdmin): contracts hold rents and staff terms
  const isAdmin = fullAdmin(me);
  const today = todayBangkok();
  const params = useSearchParams();
  const [list, setList] = useState<Contract[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ContractFilter>("all");
  const [kind, setKind] = useState<ContractKind | "all">("all");
  const [editing, setEditing] = useState<Contract | "new" | null>(null);
  const [aiOf, setAiOf] = useState<Contract | null>(null);
  const askedNew = useRef(false);

  const reload = useCallback(async () => {
    try {
      setList(await loadContracts());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (me.loaded && isAdmin) void reload();
  }, [me.loaded, isAdmin, reload]);

  // "+ New" in the top bar → /contracts?new=1
  useEffect(() => {
    if (!askedNew.current && me.loaded && isAdmin && params.get("new") === "1") {
      askedNew.current = true;
      setEditing("new");
    }
  }, [me.loaded, isAdmin, params]);

  const counts = useMemo(() => filterCounts(list ?? [], today), [list, today]);
  const shown = useMemo(
    () => sortContracts((list ?? []).filter((c) => matchesFilter(c, filter, today) && (kind === "all" || c.kind === kind) && matchesQuery(c, q)), today),
    [list, filter, kind, q, today],
  );

  if (!me.loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />;
  if (!isAdmin)
    return (
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-3">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>
      </div>
    );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("hint")}</p>
        </div>
        <Button className="h-11 rounded-full px-5 pointer-fine:h-10 max-sm:w-full" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          {t("add")}
        </Button>
      </header>

      {/* LINE works too (owner 2026-11-18): "계약서" then the photo / PDF → read, saved and summed up by AI by itself */}
      <p className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-card px-4 py-3 text-[13.5px] leading-relaxed">
        <MessageCircle className="mt-0.5 size-[18px] flex-none text-[#06c755]" aria-hidden />
        <span>
          <b className="font-semibold">{t("lineTitle")}</b> <span className="text-muted-foreground">{t("lineHint")}</span>
        </span>
      </p>

      {/* Search, state chips, kind */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-60">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 rounded-full pl-10 pointer-fine:h-10" />
          </label>
          <Select value={kind} onValueChange={(v) => setKind(v as ContractKind | "all")}>
            <SelectTrigger className="min-w-36 rounded-full px-4 data-[size=default]:h-11 max-sm:flex-1 pointer-fine:data-[size=default]:h-10" aria-label={t("kindLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("kindAll")}</SelectItem>
              {CONTRACT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label={t("filterLabel")}>
          {CONTRACT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex h-11 flex-none items-center gap-1.5 rounded-full px-4 text-sm pointer-fine:h-9",
                filter === f ? "bg-foreground font-semibold text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                f === "soon" && counts.soon > 0 && filter !== f && "bg-warn-soft text-warn",
              )}
            >
              {t(`filter.${f}`)}
              <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <div className="workspace-panel grid justify-items-center gap-3 p-6 text-center text-sm text-muted-foreground">
          {t("loadFail")}
          <Button variant="outline" className="h-11 rounded-full pointer-fine:h-9" onClick={() => void reload()}>
            {t("retry")}
          </Button>
        </div>
      ) : list === null ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />
      ) : list.length === 0 ? (
        <div className="workspace-panel grid justify-items-center gap-3 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="size-7" aria-hidden />
          </span>
          <p className="text-[17px] font-semibold">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
          <Button className="mt-1 h-11 rounded-full px-5 pointer-fine:h-10" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            {t("add")}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id}>
              <ContractCard c={c} today={today} onOpen={() => setEditing(c)} onAi={() => setAiOf(c)} />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ContractDialog
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => setList((l) => [...(l ?? []).filter((x) => x.id !== saved.id), saved])}
          onDeleted={(id) => setList((l) => (l ?? []).filter((x) => x.id !== id))}
        />
      )}
      {aiOf && <ContractAi c={aiOf} onClose={() => setAiOf(null)} onSummary={(s) => setList((l) => (l ?? []).map((x) => (x.id === aiOf.id ? { ...x, aiSummary: s } : x)))} />}
    </div>
  );
}

function DayBadge({ c, today }: { c: Contract; today: string }) {
  const t = useTranslations("contracts");
  const left = daysLeft(c, today);
  const state = contractState(c, today);
  if (state === "ended") return <Badge>{t("badge.ended")}</Badge>;
  if (state === "waiting") return <Badge tone="brand">{t("badge.waiting")}</Badge>;
  if (left === null) return <Badge tone="ok">{t("badge.open")}</Badge>;
  // Within its notice period it is never the calm blue: amber, red from 3 days; further off always blue
  return <DueBadge daysLeft={state === "soon" ? Math.min(left, 7) : Math.max(left, 8)}>{left === 0 ? t("badge.today") : t("badge.dDay", { n: left })}</DueBadge>;
}

async function openFile(path: string, failText: string) {
  // Open the tab first (a popup opened after an await is blocked on phones), then point it at the signed link
  const win = window.open("", "_blank");
  const url = await contractFileUrl(path);
  if (url && win) win.location.href = url;
  else {
    win?.close();
    toast.error(failText);
  }
}

function ContractCard({ c, today, onOpen, onAi }: { c: Contract; today: string; onOpen: () => void; onAi: () => void }) {
  const t = useTranslations("contracts");
  const day = useDay();
  const Icon = KIND_ICON[c.kind];
  const state = contractState(c, today);
  const by = noticeBy(c);
  return (
    <article
      className={cn("workspace-panel grid h-full content-start gap-3 p-4 sm:p-5", state === "soon" && "ring-1 ring-warn/30", state === "ended" && "opacity-75")}
    >
      <button type="button" onClick={onOpen} className="grid min-w-0 gap-3 text-left" aria-label={t("editOf", { title: c.title })}>
        <span className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 flex-none place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-[16px] leading-snug font-semibold">{c.title}</span>
            <span className="truncate text-[13px] text-muted-foreground">{[t(`kind.${c.kind}`), c.party].filter(Boolean).join(" · ")}</span>
          </span>
          <DayBadge c={c} today={today} />
        </span>
        <span className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-3 py-2.5 text-[13px]">
          <span className="text-muted-foreground">{t("period")}</span>
          <span className="text-right tabular-nums">
            {c.startOn || c.endOn ? `${c.startOn ? day(c.startOn) : "…"} – ${c.endOn ? day(c.endOn) : t("noEnd")}` : "—"}
          </span>
          <span className="text-muted-foreground">{t("amount")}</span>
          <span className="text-right font-semibold tabular-nums">{c.amount !== null ? bahtWhole(fromSatang(c.amount)) : "—"}</span>
          {by && (
            <>
              <span className="text-muted-foreground">{t("noticeBy")}</span>
              <span className={cn("text-right tabular-nums", by < today && state !== "ended" && "font-semibold text-bad")}>{day(by)}</span>
            </>
          )}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        {c.autoRenew && (
          <Badge tone="brand">
            <Repeat className="size-3" aria-hidden />
            {t("autoRenew")}
          </Badge>
        )}
        {c.note && <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{c.note}</span>}
        {/* AI summary + questions on the file (lib/contract-ai) */}
        {c.filePath && (
          <Button variant="secondary" className="ml-auto h-11 rounded-full bg-brand-soft px-3.5 text-[13px] text-brand hover:bg-brand-soft/80 pointer-fine:h-8" onClick={onAi}>
            <Sparkles className="size-3.5" aria-hidden />
            {c.aiSummary ? t("ai.open") : t("ai.button")}
          </Button>
        )}
        {c.filePath && (
          <Button variant="outline" className="h-11 rounded-full px-3.5 text-[13px] pointer-fine:h-8" onClick={() => void openFile(c.filePath!, t("fileFail"))}>
            <Paperclip className="size-3.5" aria-hidden />
            {t("openFile")}
          </Button>
        )}
      </div>
    </article>
  );
}

interface Form {
  title: string;
  party: string;
  kind: ContractKind;
  startOn: string;
  endOn: string;
  autoRenew: boolean;
  noticeDays: string;
  /** Baht */
  amount: number;
  hasAmount: boolean;
  note: string;
}

function ContractDialog({ initial, onClose, onSaved, onDeleted }: { initial: Contract | null; onClose: () => void; onSaved: (c: Contract) => void; onDeleted: (id: string) => void }) {
  const t = useTranslations("contracts");
  const locale = useLocale();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [f, setF] = useState<Form>(() => ({
    title: initial?.title ?? "",
    party: initial?.party ?? "",
    kind: initial?.kind ?? "lease",
    startOn: initial?.startOn ?? "",
    endOn: initial?.endOn ?? "",
    autoRenew: initial?.autoRenew ?? false,
    noticeDays: String(initial?.noticeDays ?? DEFAULT_NOTICE_DAYS),
    amount: initial?.amount != null ? fromSatang(initial.amount) : 0,
    hasAmount: initial?.amount != null,
    note: initial?.note ?? "",
  }));
  const [current, setCurrent] = useState<Contract | null>(initial);
  const [upload, setUpload] = useState<Uploaded | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drag, setDrag] = useState(false);
  const saved = useRef(false);

  const close = () => {
    // A file uploaded for a form that is not saved goes again
    if (!saved.current) void dropUpload(upload);
    onClose();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const ready = /^image\//.test(file.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(file.name) ? await preparePhoto(file) : file;
      const ok = checkFile(ready);
      if (!ok.ok) {
        toast.error(t(`fileBad.${ok.why}`));
        return;
      }
      const up = await uploadContractFile(id, new File([ready], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: ok.type }));
      await dropUpload(upload);
      setUpload(up);
      setRead(false);
    } catch {
      toast.error(t("uploadFail"));
    } finally {
      setUploading(false);
    }
  };

  const aiRead = async () => {
    const path = upload?.path ?? current?.filePath;
    if (!path) return;
    setReading(true);
    const r = await readContractFile(path, readLangOf(locale));
    setReading(false);
    if (!r.ok) {
      toast.error(t(`readFail.${r.code}`));
      return;
    }
    const x = readingToFields(r.reading);
    setF((old) => ({
      ...old,
      title: x.title || old.title,
      party: x.party || old.party,
      kind: x.kind,
      startOn: x.startOn || old.startOn,
      endOn: x.endOn || old.endOn,
      autoRenew: x.autoRenew,
      noticeDays: x.noticeDays ?? old.noticeDays,
      amount: x.amount ? Number(x.amount) : old.amount,
      hasAmount: x.amount ? true : old.hasAmount,
      note: x.note || old.note,
    }));
    setRead(true);
    toast.success(t("readDone"));
  };

  const badDates = !!(f.startOn && f.endOn && f.endOn < f.startOn);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || badDates) return;
    setBusy(true);
    try {
      const notice = Number(f.noticeDays);
      const c = await saveContract(
        {
          id,
          isNew: !initial,
          title: f.title,
          party: f.party,
          kind: f.kind,
          startOn: f.startOn || null,
          endOn: f.endOn || null,
          autoRenew: f.autoRenew,
          noticeDays: Number.isFinite(notice) ? notice : DEFAULT_NOTICE_DAYS,
          amount: f.hasAmount && f.amount > 0 ? toSatang(f.amount) : null,
          note: f.note,
        },
        upload,
        initial,
      );
      saved.current = true;
      onSaved(c);
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("saveFail"));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial) return;
    setBusy(true);
    try {
      await deleteContract(initial);
      await dropUpload(upload);
      saved.current = true;
      onDeleted(initial.id);
      toast.success(t("deleted"));
      onClose();
    } catch {
      toast.error(t("saveFail"));
      setBusy(false);
    }
  };

  const dropFile = async () => {
    if (!current) return;
    try {
      const c = await removeContractFile(current);
      setCurrent(c);
      onSaved(c);
    } catch {
      toast.error(t("saveFail"));
    }
  };

  const fileName = upload?.name ?? current?.fileName ?? null;
  const label = "grid gap-1.5";
  const cap = "text-sm font-semibold";

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>

        {/* The file: drop / pick, then the AI reads it */}
        <div
          className={cn("grid gap-2 rounded-2xl bg-primary/5 p-3 transition-colors", drag && "bg-primary/10 ring-2 ring-primary/40")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
        >
          {fileName ? (
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-background px-3 py-2">
              <Paperclip className="size-4 flex-none text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[14px]">{fileName}</span>
              {!upload && current?.filePath && (
                <>
                  <Button type="button" variant="ghost" className="h-11 rounded-full px-3 text-[13px] pointer-fine:h-8" onClick={() => void openFile(current.filePath!, t("fileFail"))}>
                    {t("openFile")}
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="size-11 rounded-full pointer-fine:size-8" aria-label={t("removeFile")} onClick={() => void dropFile()}>
                    <X className="size-4" aria-hidden />
                  </Button>
                </>
              )}
            </div>
          ) : null}
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 px-3 py-3 text-center text-[14px] font-semibold text-primary">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            {uploading ? t("uploading") : fileName ? t("pickOther") : t("pick")}
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="sr-only"
              disabled={uploading || reading}
              onChange={(x) => {
                void pick(x.target.files?.[0]);
                x.target.value = "";
              }}
            />
          </label>
          {(upload || current?.filePath) && (
            <Button type="button" className="h-11 rounded-full pointer-fine:h-10" disabled={reading || uploading} onClick={() => void aiRead()}>
              {reading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              {reading ? t("reading") : t("aiRead")}
            </Button>
          )}
          <p className="text-center text-[12px] text-muted-foreground">{read ? t("readCheck") : t("pickHint")}</p>
        </div>

        <form onSubmit={save} className="grid gap-4">
          <label className={label}>
            <span className={cap}>{t("fTitle")}</span>
            <Input value={f.title} maxLength={120} required placeholder={t("fTitlePh")} onChange={(e) => setF({ ...f, title: e.target.value })} className="h-11" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span className={cap}>{t("fParty")}</span>
              <Input value={f.party} maxLength={120} placeholder={t("fPartyPh")} onChange={(e) => setF({ ...f, party: e.target.value })} className="h-11" />
            </label>
            <div className={label}>
              <span className={cap}>{t("kindLabel")}</span>
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as ContractKind })}>
                <SelectTrigger className="w-full data-[size=default]:h-11" aria-label={t("kindLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kind.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              <span className={cap}>{t("fStart")}</span>
              <DateInput value={f.startOn} onChange={(e) => setF({ ...f, startOn: e.target.value })} className="h-11" />
            </label>
            <label className={label}>
              <span className={cap}>{t("fEnd")}</span>
              <DateInput value={f.endOn} onChange={(e) => setF({ ...f, endOn: e.target.value })} className="h-11" aria-invalid={badDates} />
            </label>
          </div>
          {badDates && <p className="-mt-2 text-[13px] text-bad">{t("badDates")}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              <span className={cap}>{t("fNotice")}</span>
              <Input type="number" inputMode="numeric" min={0} max={365} value={f.noticeDays} onChange={(e) => setF({ ...f, noticeDays: e.target.value })} className="h-11" />
            </label>
            <label className={label}>
              <span className={cap}>{t("fAmount")}</span>
              <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v, hasAmount: v > 0 })} className="h-11" />
            </label>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <span className="grid gap-0.5">
              <span className={cap}>{t("autoRenew")}</span>
              <span className="text-[12px] text-muted-foreground">{t("autoRenewHint")}</span>
            </span>
            <Switch checked={f.autoRenew} onCheckedChange={(v) => setF({ ...f, autoRenew: v })} aria-label={t("autoRenew")} />
          </label>
          <label className={label}>
            <span className={cap}>{t("fNote")}</span>
            <Textarea value={f.note} maxLength={1000} rows={2} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>

          <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
            {initial ? (
              confirmDelete ? (
                <Button type="button" variant="destructive" className="h-11 rounded-full pointer-fine:h-9" disabled={busy} onClick={() => void remove()}>
                  <Trash2 className="size-4" aria-hidden />
                  {t("deleteSure")}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="h-11 rounded-full text-bad pointer-fine:h-9" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" aria-hidden />
                  {t("delete")}
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-full px-4 pointer-fine:h-9" onClick={close}>
                {t("cancel")}
              </Button>
              <Button type="submit" className="h-11 rounded-full px-5 pointer-fine:h-9" disabled={busy || uploading || reading || !f.title.trim() || badDates}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
