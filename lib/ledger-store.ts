"use client";

// The ledger in Supabase (step 5): public.documents + document_items, photos in the private "documents"
// bucket. Deleting is a soft delete (deleted_at / deleted_by / delete_reason) that only admins can do or
// undo — enforced by RLS and triggers, not just this code. Who/when is stamped by the database.

import { useEffect, useState, useSyncExternalStore } from "react";
import { type DocumentRow, docToRow, type ItemRow, rowToDoc } from "./db-map";
import { supabaseBrowser } from "./supabase/client";
import type { LedgerDoc } from "./types";

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
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

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
  listeners.forEach((l) => l());
}

const refresh = () => (loading ??= reload().finally(() => (loading = null)));

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
    void refresh();
    // Colleagues may have changed things while this tab was in the background
    const onFocus = () => void refresh();
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

// Signed URLs for the private bucket, cached for most of their one-hour life
const signed = new Map<string, { url: string; until: number }>();

export function usePhotoUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (signed.get(path)?.url ?? null) : null));
  useEffect(() => {
    if (!path) return setUrl(null);
    const hit = signed.get(path);
    if (hit && hit.until > Date.now()) return setUrl(hit.url);
    let alive = true;
    void supabaseBrowser()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!data || !alive) return;
        signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
