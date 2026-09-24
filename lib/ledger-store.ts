"use client";

// TEMPORARY ledger until Supabase exists (step 5): documents + photos in this browser's IndexedDB.
// Deleting is a soft delete: the row stays with deletedAt / deletedBy / deleteReason
// (step 5 columns: deleted_at timestamptz, deleted_by uuid, delete_reason text) and admins can restore it.

import { useEffect, useSyncExternalStore } from "react";
import type { LedgerDoc } from "./types";

/** "draft" = saved to finish later (not in monthly totals); "final" = in the ledger */
export type EntryStatus = "draft" | "final";
export type LedgerView = "ledger" | "drafts" | "trash";

export interface LedgerEntry {
  id: string;
  status: EntryStatus;
  doc: LedgerDoc;
  photo: Blob | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deletedBy: string | null;
  deleteReason: string | null;
}

/** Reasons must say something; a single character is not a reason. */
export const MIN_REASON = 2;
export const isValidReason = (s: string) => s.trim().length >= MIN_REASON;

/** Ledger (final, newest first), drafts (last edited first) or trash (last deleted first). Entries from before drafts existed count as final. */
export function pick(entries: LedgerEntry[], view: LedgerView): LedgerEntry[] {
  const live = (e: LedgerEntry) => e.deletedAt === null;
  const draft = (e: LedgerEntry) => e.status === "draft";
  if (view === "trash") return entries.filter((e) => !live(e)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  if (view === "drafts") return entries.filter((e) => live(e) && draft(e)).sort((a, b) => b.updatedAt - a.updatedAt);
  return entries.filter((e) => live(e) && !draft(e)).sort((a, b) => b.createdAt - a.createdAt);
}

const DB = "trl-ledger";
const STORE = "docs";
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let entries: LedgerEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DB) : null;

async function reload() {
  const rows = await run<LedgerEntry[]>("readonly", (s) => s.getAll());
  // Rows saved before drafts / stickers existed
  entries = rows.map((e) => ({ ...e, status: e.status ?? "final", doc: { ...e.doc, stickers: e.doc.stickers ?? [] } }));
  loaded = true;
  listeners.forEach((l) => l());
}
channel?.addEventListener("message", () => void reload());
const changed = async () => {
  await reload();
  channel?.postMessage("changed");
};

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
    if (!loaded) void reload();
  }, []);
  return { entries: snap, loaded };
}

export async function getEntry(id: string): Promise<LedgerEntry | undefined> {
  return run<LedgerEntry | undefined>("readonly", (s) => s.get(id));
}

export async function saveEntry(
  doc: LedgerDoc,
  photo: Blob | null,
  id: string = doc.id || crypto.randomUUID(),
  status: EntryStatus = "final",
): Promise<string> {
  const prev = await getEntry(id);
  const now = Date.now();
  const entry: LedgerEntry = {
    id,
    status,
    doc: { ...doc, id },
    photo: photo ?? prev?.photo ?? null,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deletedAt: prev?.deletedAt ?? null,
    deletedBy: prev?.deletedBy ?? null,
    deleteReason: prev?.deleteReason ?? null,
  };
  await run("readwrite", (s) => s.put(entry));
  await changed();
  return id;
}

export async function softDelete(id: string, reason: string, by: string) {
  if (!isValidReason(reason)) throw new Error("reason required");
  const e = await getEntry(id);
  if (!e) return;
  await run("readwrite", (s) => s.put({ ...e, deletedAt: Date.now(), deletedBy: by, deleteReason: reason.trim().slice(0, 200) }));
  await changed();
}

export async function restoreEntry(id: string) {
  const e = await getEntry(id);
  if (!e) return;
  await run("readwrite", (s) => s.put({ ...e, deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: Date.now() }));
  await changed();
}
