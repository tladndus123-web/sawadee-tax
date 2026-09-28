"use client";

// The ledger in Supabase (step 5): public.documents + document_items, photos in the private "documents"
// bucket. Deleting is a soft delete (deleted_at / deleted_by / delete_reason) that only admins can do or
// undo — enforced by RLS and triggers, not just this code. Who/when is stamped by the database.

import { useEffect, useState, useSyncExternalStore } from "react";
import { invoiceMonth } from "./archive";
import { type DocumentRow, docToRow, type ItemRow, rowToDoc } from "./db-map";
import { lockedMonths, openClaimMonth } from "./month-lock-store";
import { supabaseBrowser } from "./supabase/client";
import { photoHash } from "./photo-hash";
import { ALL } from "./branches";
import { branchNow, subscribeBranch } from "./branch-store";
import type { LedgerDoc, Sticker } from "./types";

/** "draft" = saved to finish later (not in monthly totals); "final" = in the ledger (db status "reviewed") */
export type EntryStatus = "draft" | "final";
export type LedgerView = "ledger" | "drafts" | "trash";

export interface LedgerEntry {
  id: string;
  status: EntryStatus;
  doc: LedgerDoc;
  /** Path in the private "documents" bucket; show it with usePhotoUrl() */
  photoPath: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Display name (or email) of the admin who deleted it */
  deletedBy: string | null;
  /** Warnings a person marked "문제 없음", who (display name) and when */
  ackFlags: string[];
  ackBy: string | null;
  ackAt: number | null;
  deleteReason: string | null;
  /** The office (an admin) looked at it — null: saved by staff or the LINE bot and not yet checked */
  checkedAt: number | null;
  checkedBy: string | null;
}

/** Reasons must say something; a single character is not a reason. */
export const MIN_REASON = 2;
export const isValidReason = (s: string) => s.trim().length >= MIN_REASON;

/** Ledger (final, newest first), drafts (last edited first) or trash (last deleted first). */
export function pick(entries: LedgerEntry[], view: LedgerView): LedgerEntry[] {
  const live = (e: LedgerEntry) => e.deletedAt === null;
  const draft = (e: LedgerEntry) => e.status === "draft";
  if (view === "trash") return entries.filter((e) => !live(e)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  if (view === "drafts") return entries.filter((e) => live(e) && draft(e)).sort((a, b) => b.updatedAt - a.updatedAt);
  return entries.filter((e) => live(e) && !draft(e)).sort((a, b) => b.createdAt - a.createdAt);
}

const BUCKET = "documents";
const time = (s: string | null) => (s ? Date.parse(s) : null);

let entries: LedgerEntry[] = [];
let loaded = false;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
/** Member id → display name (or email), kept from the last full load for stamps patched in place */
let names = new Map<string, string>();

/**
 * Small changes (paid, stickers, "문제 없음") patch the documents already in memory instead of downloading the whole
 * ledger again — that download grows with every document (about 4.6 KB each), a click should not.
 */
function patchEntries(ids: string[], change: (e: LedgerEntry) => LedgerEntry) {
  const set = new Set(ids);
  entries = entries.map((e) => (set.has(e.id) ? change(e) : e));
  listeners.forEach((l) => l());
}

/** Fingerprints of the photos already in the books (drafts too; not the trash), for the duplicate check */
export interface KnownPhoto {
  id: string;
  hash: string;
  docNo: string;
  status: EntryStatus;
}
let known: KnownPhoto[] = [];
let knownAt = 0;
export async function knownPhotos(): Promise<KnownPhoto[]> {
  if (Date.now() - knownAt < 30_000) return known;
  const { data, error } = await supabaseBrowser().from("documents").select("id, photo_hash, doc_no, status").not("photo_hash", "is", null).is("deleted_at", null);
  if (error) return known;
  known = (data ?? []).map((r) => ({ id: r.id as string, hash: r.photo_hash as string, docNo: (r.doc_no as string) ?? "", status: r.status === "draft" ? "draft" : "final" }));
  knownAt = Date.now();
  return known;
}

/** Screens opened within this time reuse the copy in memory instead of downloading the whole ledger again */
const FRESH_MS = 30_000;

async function reload() {
  const supabase = supabaseBrowser();
  const [{ data: rows, error }, { data: members }] = await Promise.all([
    supabase.from("documents").select("*, document_items(*)").order("created_at", { ascending: false }),
    supabase.from("members").select("user_id, name, email"),
  ]);
  if (error) throw error;
  const who = new Map((members ?? []).map((m) => [m.user_id as string, (m.name as string) || (m.email as string)]));
  names = who;
  entries = (rows ?? []).map((r) => {
    const row = r as DocumentRow & { document_items: ItemRow[]; ack_flags?: string[] | null; ack_by?: string | null; ack_at?: string | null; checked_at?: string | null; checked_by?: string | null };
    return {
      id: row.id,
      status: row.status === "draft" ? "draft" : "final",
      doc: rowToDoc(row, row.document_items ?? []),
      photoPath: row.photo_path,
      createdAt: time(row.created_at) ?? 0,
      updatedAt: time(row.updated_at) ?? 0,
      deletedAt: time(row.deleted_at),
      deletedBy: row.deleted_by ? (who.get(row.deleted_by) ?? null) : null,
      deleteReason: row.delete_reason,
      ackFlags: row.ack_flags ?? [],
      ackBy: row.ack_by ? (who.get(row.ack_by) ?? null) : null,
      ackAt: time(row.ack_at ?? null),
      checkedAt: time(row.checked_at ?? null),
      checkedBy: row.checked_by ? (who.get(row.checked_by) ?? null) : null,
    };
  });
  loaded = true;
  loadedAt = Date.now();
  listeners.forEach((l) => l());
}

const refresh = () => (loading ??= reload().finally(() => (loading = null)));
const refreshIfStale = () => (Date.now() - loadedAt > FRESH_MS ? refresh() : undefined);

// The branch the person works in: only its documents (cached per list and choice, so React sees a stable value)
let viewKey: { entries: LedgerEntry[]; branch: string } | null = null;
let view: LedgerEntry[] = [];
function forBranch(): LedgerEntry[] {
  const branch = branchNow();
  if (viewKey?.entries !== entries || viewKey.branch !== branch) {
    viewKey = { entries, branch };
    view = branch === ALL ? entries : entries.filter((e) => e.doc.branchId === branch);
  }
  return view;
}

/** The ledger of the branch the person works in; `all: true` = every branch (the dashboard's comparison) */
export function useLedger(opts: { all?: boolean } = {}): { entries: LedgerEntry[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const off = subscribeBranch(l);
      return () => {
        listeners.delete(l);
        off();
      };
    },
    () => (opts.all ? entries : forBranch()),
    () => entries,
  );
  useEffect(() => {
    void refreshIfStale();
    // Colleagues may have changed things while this tab was in the background
    const onFocus = () => void refreshIfStale();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return { entries: snap, loaded };
}

/** The office checked these documents (admins only; the database refuses anyone else). `on: false` undoes it. */
export async function setChecked(ids: string[], on: boolean, meName: string) {
  if (!ids.length) return;
  const { error } = await supabaseBrowser()
    .from("documents")
    .update({ checked_at: on ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) throw error;
  patchEntries(ids, (e) => ({ ...e, checkedAt: on ? Date.now() : null, checkedBy: on ? meName : null }));
}

/** Mark a document's warnings "문제 없음" ([] undoes it). Who / when are stamped by the database. */
export async function setAck(id: string, flags: string[]) {
  const { data, error } = await supabaseBrowser()
    .from("documents")
    .update({ ack_flags: [...new Set(flags)].sort() })
    .eq("id", id)
    .select("ack_flags, ack_by, ack_at")
    .single();
  if (error) throw error;
  const row = data as { ack_flags: string[] | null; ack_by: string | null; ack_at: string | null };
  patchEntries([id], (e) => ({ ...e, ackFlags: row.ack_flags ?? [], ackBy: row.ack_by ? (names.get(row.ack_by) ?? null) : null, ackAt: time(row.ack_at) }));
}

/**
 * Insert or update a document (and its items) in one transaction; a new photo goes to storage first.
 * `original`: the PDF the picture was drawn from (e-Tax Invoice) — kept as it is next to the picture, because the
 * buyer must keep the electronic original (RD e-Tax Invoice rules), not only a printout.
 */
export async function saveEntry(
  doc: LedgerDoc,
  photo: Blob | null,
  id: string = doc.id || crypto.randomUUID(),
  status: EntryStatus = "final",
  companyTaxId?: string,
  original?: File | null,
): Promise<{ id: string; movedTo: string }> {
  const supabase = supabaseBrowser();
  // A late invoice whose month is already closed (filed) is claimed in the next open month instead
  let movedTo = "";
  if (status === "final" && !doc.taxMonth) {
    movedTo = openClaimMonth(invoiceMonth(doc), await lockedMonths());
    if (movedTo) doc = { ...doc, taxMonth: movedTo };
  }
  let photoPath: string | undefined;
  if (photo) {
    photoPath = `${id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
    if (error) throw error;
    // Small copy for the ledger list; best effort (the list falls back to the full photo)
    const thumb = await makeThumb(photo);
    if (thumb) await supabase.storage.from(BUCKET).upload(thumbPath(photoPath), thumb, { contentType: "image/jpeg" });
    if (original && (original.type === "application/pdf" || /\.pdf$/i.test(original.name))) {
      const { error: pdfError } = await supabase.storage.from(BUCKET).upload(originalPdfPath(photoPath), original, { contentType: "application/pdf" });
      if (pdfError) throw pdfError;
    }
  }
  const { row, items } = docToRow({ ...doc, id }, status === "final" ? "reviewed" : "draft", companyTaxId);
  // The photo's fingerprint, so the same photo is caught next time (lib/photo-hash)
  const hash = photo ? await photoHash(photo) : null;
  const { error } = await supabase.rpc("save_document", {
    p_id: id,
    p_row: photoPath ? { ...row, photo_path: photoPath, ...(hash ? { photo_hash: hash } : {}) } : row,
    p_items: items,
  });
  if (error) throw error;
  knownAt = 0;
  await reload();
  return { id, movedTo };
}

/**
 * Payment and colour stickers, changed on their own without rewriting the document. They stay changeable in a
 * closed tax month (they aren't in the purchase tax report), unlike a full save.
 */
export async function setQuick(id: string, change: { paid?: boolean; paidDate?: string; stickers?: Sticker[] }) {
  const row: Record<string, unknown> = {};
  if (change.paid !== undefined) row.paid = change.paid;
  if (change.paidDate !== undefined) row.paid_date = change.paidDate || null;
  if (change.stickers) row.stickers = change.stickers;
  const { error } = await supabaseBrowser().from("documents").update(row).eq("id", id);
  if (error) throw error;
  patchEntries([id], (e) => ({
    ...e,
    doc: {
      ...e.doc,
      ...(change.paid !== undefined ? { paid: change.paid } : {}),
      ...(change.paidDate !== undefined ? { paidDate: change.paidDate } : {}),
      ...(change.stickers ? { stickers: change.stickers } : {}),
    },
    updatedAt: Date.now(),
  }));
}

/** Mark several documents paid (or unpaid) at once, e.g. after a payment run; one request */
export async function setPaidMany(ids: string[], paid: boolean, paidDate: string) {
  if (!ids.length) return;
  const { error } = await supabaseBrowser()
    .from("documents")
    .update({ paid, paid_date: paid ? paidDate || null : null })
    .in("id", ids);
  if (error) throw error;
  patchEntries(ids, (e) => ({ ...e, doc: { ...e.doc, paid, paidDate: paid ? paidDate : "" }, updatedAt: Date.now() }));
}

/** One category for several documents at once (their lines keep their own); closed months are refused by the database */
export async function setCategoryMany(ids: string[], category: LedgerDoc["category"]) {
  if (!ids.length) return;
  const { error } = await supabaseBrowser().from("documents").update({ category }).in("id", ids);
  if (error) throw error;
  patchEntries(ids, (e) => ({ ...e, doc: { ...e.doc, category }, updatedAt: Date.now() }));
}

/** The person's remark on a document (비고); allowed in a closed month too (not part of the figures) */
export async function setMemo(id: string, memo: string) {
  const { error } = await supabaseBrowser().from("documents").update({ memo }).eq("id", id);
  if (error) throw error;
  patchEntries([id], (e) => ({ ...e, doc: { ...e.doc, memo }, updatedAt: Date.now() }))
}

/** Equipment sold or thrown away on `date` ("" = still in use). Only into and out of open months (the database checks). */
export async function setDisposed(id: string, date: string) {
  const { error } = await supabaseBrowser().from("documents").update({ disposed_on: date || null }).eq("id", id);
  if (error) throw error;
  patchEntries([id], (e) => ({ ...e, doc: { ...e.doc, disposedOn: date }, updatedAt: Date.now() }));
}

/** Admin only. The database stamps who and when and refuses anyone else. */
export async function softDelete(id: string, reason: string) {
  if (!isValidReason(reason)) throw new Error("reason required");
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id, delete_reason: reason.trim().slice(0, 200) })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** Admin only: bring several documents back from the trash at once */
export async function restoreMany(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabaseBrowser()
    .from("documents")
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  await reload();
  return data?.length ?? 0;
}

/** Admin only. */
export async function restoreEntry(id: string) {
  const { data, error } = await supabaseBrowser()
    .from("documents")
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/**
 * Admin only, trashed documents only, never a saved document of a closed month (the database refuses anything
 * else and keeps a short record). Its photo goes too, unless another document still uses the same file.
 */
export async function purgeMany(ids: string[]): Promise<{ done: number; locked: number; failed: number }> {
  const supabase = supabaseBrowser();
  const photos = new Set<string>();
  const out = { done: 0, locked: 0, failed: 0 };
  for (const id of ids) {
    const { data: photo, error } = await supabase.rpc("purge_document", { p_id: id });
    if (error) {
      if (/month_locked/.test(error.message)) out.locked += 1;
      else out.failed += 1;
      continue;
    }
    out.done += 1;
    if (typeof photo === "string" && photo) photos.add(photo);
  }
  for (const photo of photos) {
    const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("photo_path", photo);
    if (!count) await supabase.storage.from(BUCKET).remove([photo, thumbPath(photo), originalPdfPath(photo)]);
  }
  await reload();
  return out;
}

/** Where the original PDF of a document uploaded as a PDF lives (next to its picture; none for photos) */
export const originalPdfPath = (photoPath: string) => photoPath.replace(/(\.[a-z0-9]+)?$/i, ".pdf");

/** Download links (valid 1 hour) for a document's picture and, when it came as a PDF, the original PDF */
export async function downloadLinks(photoPath: string, name: string): Promise<{ photo: string | null; pdf: string | null }> {
  const bucket = supabaseBrowser().storage.from(BUCKET);
  const safe = name.replace(/[\\/:*?"<>|\s]+/g, "_") || "document";
  const [photo, pdf] = await Promise.all([
    bucket.createSignedUrl(photoPath, 3600, { download: `${safe}.jpg` }),
    bucket.createSignedUrl(originalPdfPath(photoPath), 3600, { download: `${safe}.pdf` }),
  ]);
  return { photo: photo.data?.signedUrl ?? null, pdf: pdf.error ? null : (pdf.data?.signedUrl ?? null) };
}

/** Where the small list copy of a photo lives (photos saved before 2026-09-26 have none) */
export const thumbPath = (photoPath: string) => photoPath.replace(/(\.[a-z0-9]+)?$/i, ".thumb.jpg");

/** Shortest side of the list copy, in pixels (shown at 48–64 px, sharp on 2x screens) */
const THUMB_PX = 160;

function drawThumb(src: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, THUMB_PX / Math.min(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.8));
}

async function makeThumb(photo: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(photo);
    const blob = await drawThumb(bmp, bmp.width, bmp.height);
    bmp.close();
    return blob;
  } catch {
    return null;
  }
}

const healing = new Set<string>();

/**
 * An older photo (or one sent through LINE) shown in a list without its small copy: make the copy from the
 * image that just loaded, once, so from then on everyone's list loads ~10 KB instead of the whole photo.
 * The <img> needs crossOrigin="anonymous" (storage allows it) or the canvas can't be read.
 */
export async function healThumb(img: HTMLImageElement, photoPath: string) {
  if (healing.has(photoPath) || !img.naturalWidth) return;
  healing.add(photoPath);
  try {
    const blob = await drawThumb(img, img.naturalWidth, img.naturalHeight);
    if (!blob) return;
    const { error } = await supabaseBrowser().storage.from(BUCKET).upload(thumbPath(photoPath), blob, { contentType: "image/jpeg" });
    if (!error) signed.delete(thumbPath(photoPath));
  } catch {
    // not important: the list keeps showing the full photo
  }
}

// Signed URLs for the private bucket, cached for most of their one-hour life. Requests made together
// (a list of rows) go out as one call; a missing file (an older photo without a list copy) is remembered too.
const signed = new Map<string, { url: string | null; until: number }>();
let waiting = new Map<string, ((url: string | null) => void)[]>();
let flushTimer = 0;

function signUrl(path: string): Promise<string | null> {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
  return new Promise((done) => {
    waiting.set(path, [...(waiting.get(path) ?? []), done]);
    flushTimer ||= window.setTimeout(signWaiting, 20);
  });
}

async function signWaiting() {
  const batch = waiting;
  waiting = new Map();
  flushTimer = 0;
  const paths = [...batch.keys()];
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrls(paths, 3600);
  const until = Date.now() + 50 * 60 * 1000;
  for (const path of paths) {
    const item = data?.find((d) => d.path === path);
    const url = item && !item.error && item.signedUrl ? item.signedUrl : null;
    // A failed call is not remembered, so the next screen tries again
    if (!error) signed.set(path, { url, until });
    batch.get(path)?.forEach((done) => done(url));
  }
}

const cachedUrl = (path: string | null) => {
  const hit = path ? signed.get(path) : undefined;
  return hit && hit.until > Date.now() ? hit.url : null;
};

/** A viewable link for a stored photo; "thumb" = the small list copy when there is one */
export function usePhotoUrl(path: string | null, size: "full" | "thumb" = "full"): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? ((size === "thumb" && cachedUrl(thumbPath(path))) || cachedUrl(path)) : null));
  useEffect(() => {
    if (!path) return setUrl(null);
    let alive = true;
    void (async () => {
      const found = (size === "thumb" ? await signUrl(thumbPath(path)) : null) ?? (await signUrl(path));
      if (alive) setUrl(found);
    })();
    return () => {
      alive = false;
    };
  }, [path, size]);
  return url;
}
