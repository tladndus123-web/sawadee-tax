"use client";

// The ledger in Supabase (step 5): public.documents + document_items, photos in the private "documents"
// bucket. Deleting is a soft delete (deleted_at / deleted_by / delete_reason) that only admins can do or
// undo — enforced by RLS and triggers, not just this code. Who/when is stamped by the database.

import { useEffect, useState, useSyncExternalStore } from "react";
import { type DocumentRow, docToRow, type ItemRow, rowToDoc } from "./db-map";
import { supabaseBrowser } from "./supabase/client";
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
  deleteReason: string | null;
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
  entries = (rows ?? []).map((r) => {
    const row = r as DocumentRow & { document_items: ItemRow[] };
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
    };
  });
  loaded = true;
  loadedAt = Date.now();
  listeners.forEach((l) => l());
}

const refresh = () => (loading ??= reload().finally(() => (loading = null)));
const refreshIfStale = () => (Date.now() - loadedAt > FRESH_MS ? refresh() : undefined);

export function useLedger(): { entries: LedgerEntry[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
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

export async function getEntry(id: string): Promise<LedgerEntry | undefined> {
  if (!loaded) await refresh();
  return entries.find((e) => e.id === id);
}

/** Insert or update a document (and its items) in one transaction; a new photo goes to storage first. */
export async function saveEntry(
  doc: LedgerDoc,
  photo: Blob | null,
  id: string = doc.id || crypto.randomUUID(),
  status: EntryStatus = "final",
  companyTaxId?: string,
): Promise<string> {
  const supabase = supabaseBrowser();
  let photoPath: string | undefined;
  if (photo) {
    photoPath = `${id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
    if (error) throw error;
    // Small copy for the ledger list; best effort (the list falls back to the full photo)
    const thumb = await makeThumb(photo);
    if (thumb) await supabase.storage.from(BUCKET).upload(thumbPath(photoPath), thumb, { contentType: "image/jpeg" });
  }
  const { row, items } = docToRow({ ...doc, id }, status === "final" ? "reviewed" : "draft", companyTaxId);
  const { error } = await supabase.rpc("save_document", {
    p_id: id,
    p_row: photoPath ? { ...row, photo_path: photoPath } : row,
    p_items: items,
  });
  if (error) throw error;
  await reload();
  return id;
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
  await reload();
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
