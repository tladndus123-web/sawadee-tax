// Contract box (계약서함, 2026-11-18; public.contracts, …004700): the pure part — kinds, how far from its end a contract
// is, the list's order, filters and search, and which file may be attached. Ported from the for-sale version (one
// company here: no company folder). The browser side is lib/contract-store.ts; the AI reading lib/contract-read.ts.

import { type ContractAi, readContractAi } from "./contract-ai";

export const CONTRACT_KINDS = ["lease", "supply", "service", "employment", "loan", "insurance", "partnership", "other"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const isContractKind = (v: unknown): v is ContractKind => (CONTRACT_KINDS as readonly unknown[]).includes(v);

/** What the database keeps; dates are "YYYY-MM-DD", the amount in satang */
export interface Contract {
  id: string;
  title: string;
  party: string;
  kind: ContractKind;
  startOn: string | null;
  endOn: string | null;
  autoRenew: boolean;
  noticeDays: number;
  /** Satang (rent a month, the fee or the total, as written); null = none */
  amount: number | null;
  note: string;
  filePath: string | null;
  fileName: string | null;
  fileType: string | null;
  branchId: string | null;
  createdAt: string;
  /** The AI summary kept with it (lib/contract-ai), null = not made yet */
  aiSummary?: ContractAi | null;
}

/** "Ends soon" when no notice period is set */
export const DEFAULT_NOTICE_DAYS = 30;

/** Row of public.contracts → Contract (anything odd becomes the plain value) */
export function rowToContract(r: Record<string, unknown>): Contract {
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    id: str(r.id),
    title: str(r.title),
    party: str(r.party),
    kind: isContractKind(r.kind) ? r.kind : "other",
    startOn: day(r.start_on),
    endOn: day(r.end_on),
    autoRenew: r.auto_renew === true,
    noticeDays: Math.min(365, Math.max(0, Math.floor(num(r.notice_days) ?? DEFAULT_NOTICE_DAYS))),
    amount: num(r.amount),
    note: str(r.note),
    filePath: str(r.file_path) || null,
    fileName: str(r.file_name) || null,
    fileType: str(r.file_type) || null,
    branchId: str(r.branch_id) || null,
    createdAt: str(r.created_at),
    aiSummary: readContractAi(r.ai_summary),
  };
}

const DAY_MS = 86_400_000;
const utcDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Whole days from `today` to `day` (negative = past) */
export const daysBetween = (today: string, day: string): number => Math.round((utcDay(day) - utcDay(today)) / DAY_MS);

/**
 * Where the contract stands today:
 * - "open": no end day (a standing contract)
 * - "waiting": has not started yet
 * - "soon": ends within its notice days (30 when none is set)
 * - "active": ends later than that
 * - "ended": the end day has passed
 */
export type ContractState = "open" | "waiting" | "active" | "soon" | "ended";
export const CONTRACT_STATES: readonly ContractState[] = ["open", "waiting", "active", "soon", "ended"];

/** How many days before the end "ends soon" starts: the contract's notice days, 30 when it has none */
export const warnDays = (c: Pick<Contract, "noticeDays">): number => (c.noticeDays > 0 ? c.noticeDays : DEFAULT_NOTICE_DAYS);

export function contractState(c: Pick<Contract, "startOn" | "endOn" | "noticeDays">, today: string): ContractState {
  if (c.endOn && c.endOn < today) return "ended";
  if (c.endOn && daysBetween(today, c.endOn) <= warnDays(c)) return "soon";
  if (c.startOn && c.startOn > today) return "waiting";
  if (!c.endOn) return "open";
  return "active";
}

/** Days to the end (negative = ended that many days ago); null with no end day */
export const daysLeft = (c: Pick<Contract, "endOn">, today: string): number | null => (c.endOn ? daysBetween(today, c.endOn) : null);

/** The last day to say no to an automatic renewal (end − notice days); null without an end or a notice */
export function noticeBy(c: Pick<Contract, "endOn" | "noticeDays" | "autoRenew">): string | null {
  if (!c.endOn || !c.autoRenew || c.noticeDays <= 0) return null;
  return new Date(utcDay(c.endOn) - c.noticeDays * DAY_MS).toISOString().slice(0, 10);
}

export type ContractFilter = "all" | "soon" | "active" | "ended";
export const CONTRACT_FILTERS: readonly ContractFilter[] = ["all", "soon", "active", "ended"];

/** "active" = in force or about to start (not ended); "soon" = ends within its notice days */
export function matchesFilter(c: Contract, f: ContractFilter, today: string): boolean {
  const s = contractState(c, today);
  if (f === "all") return true;
  if (f === "soon") return s === "soon";
  if (f === "ended") return s === "ended";
  return s !== "ended";
}

const fold = (s: string) => s.normalize("NFKC").toLowerCase();

/** Search by title, who it is with, the note and the file name (every word, any part, any case, full / half width alike) */
export function matchesQuery(c: Pick<Contract, "title" | "party" | "note" | "fileName">, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${c.title} ${c.party} ${c.note} ${c.fileName ?? ""}`);
  return words.every((w) => hay.includes(w));
}

/** The list's order: "ends soon" first (soonest end first), then the others running by end, the standing ones, ended last (newest end first) */
export function sortContracts(list: readonly Contract[], today: string): Contract[] {
  const rank = (c: Contract) => {
    const s = contractState(c, today);
    return s === "soon" ? 0 : s === "ended" ? 3 : c.endOn ? 1 : 2;
  };
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0 || ra === 1) return (a.endOn ?? "").localeCompare(b.endOn ?? "") || a.title.localeCompare(b.title);
    if (ra === 3) return (b.endOn ?? "").localeCompare(a.endOn ?? "") || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
}

/** How many are in each filter (the chips' counts) */
export function filterCounts(list: readonly Contract[], today: string): Record<ContractFilter, number> {
  return Object.fromEntries(CONTRACT_FILTERS.map((f) => [f, list.filter((c) => matchesFilter(c, f, today)).length])) as Record<ContractFilter, number>;
}

/** Contracts ending within their notice period, soonest first (dashboard / calendar "coming up") */
export function endingSoon(list: readonly Contract[], today: string): Contract[] {
  return sortContracts(
    list.filter((c) => contractState(c, today) === "soon"),
    today,
  );
}

/** Files that may be attached: a PDF or a photo, at most 15 MB (the bucket's limit) */
export const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ContractFileType = (typeof FILE_TYPES)[number];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type FileCheck = { ok: true; type: ContractFileType } | { ok: false; why: "type" | "size" | "empty" };

/** The type comes from the file's own type, or from its extension when the browser left it empty */
export function checkFile(f: { name: string; type: string; size: number }): FileCheck {
  if (f.size <= 0) return { ok: false, why: "empty" };
  if (f.size > MAX_FILE_BYTES) return { ok: false, why: "size" };
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const byExt: Record<string, ContractFileType> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const type = (FILE_TYPES as readonly string[]).includes(f.type) ? (f.type as ContractFileType) : byExt[ext];
  return type ? { ok: true, type } : { ok: false, why: "type" };
}

/**
 * A storage-safe copy of a file name: Latin letters and digits stay, the rest becomes "-", at most 80 characters (Supabase
 * Storage refuses keys with other characters — a Thai or Japanese name is kept whole in contracts.file_name instead)
 */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKC").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

/** Where a contract's file goes in the documents bucket: "contracts/<contract>/<time>-<name>" */
export const contractFilePath = (contractId: string, name: string, now = Date.now()): string => `contracts/${contractId}/${now}-${safeFileName(name)}`;

/** True for a path inside the contracts folder (never another folder, never "..") */
export const isContractPath = (path: string): boolean => /^contracts\/[0-9a-f-]{36}\/[^/]+$/i.test(path) && !path.includes("..");

/** The file type a contract path stands for, from its extension */
export function typeOfPath(path: string): ContractFileType | null {
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
}
