"use client";

// The waste log in the browser (public.waste_logs, …004600): read with the person's own session, so the database decides
// which branches they see; follows the branch being worked in. Photos go to the private documents bucket under
// "waste/<log id>/…".

import { useEffect, useSyncExternalStore } from "react";
import { ALL } from "./branches";
import { branchNow, useBranch } from "./branch-store";
import { allRows } from "./fetch-all";
import { supabaseBrowser } from "./supabase/client";
import { rowToWaste, type WasteLog, type WasteReason } from "./waste";

const BUCKET = "documents";
let rows: WasteLog[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
let snap = { logs: rows, loaded };
const emit = () => {
  snap = { logs: rows, loaded };
  listeners.forEach((l) => l());
};

export async function reloadWaste() {
  const { data, error } = await allRows<Record<string, unknown>>(() => supabaseBrowser().from("waste_logs").select("*").order("day", { ascending: false }));
  if (error) throw error;
  rows = (data ?? []).map(rowToWaste);
  loaded = true;
  emit();
}

/** The waste lines of the branch being worked in (all branches: every one this person sees) */
export function useWaste(): { logs: WasteLog[]; loaded: boolean } {
  const branch = useBranch();
  useEffect(() => {
    if (started) return;
    started = true;
    void reloadWaste().catch(() => {
      loaded = true;
      emit();
    });
  }, []);
  const s = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snap,
    () => snap,
  );
  return { logs: branch === ALL ? s.logs : s.logs.filter((l) => l.branchId === branch), loaded: s.loaded };
}

export interface WasteInput {
  id?: string;
  branchId?: string;
  day: string;
  item: string;
  qty: number;
  unit: string;
  amount: number | null;
  reason: WasteReason;
  note: string;
  /** A new photo to attach (already shrunk) */
  photo?: File | null;
  /** The photo it has now (kept unless a new one comes) */
  photoPath?: string | null;
}

export async function saveWaste(w: WasteInput) {
  const sb = supabaseBrowser();
  const id = w.id ?? crypto.randomUUID();
  let photoPath = w.photoPath ?? null;
  // A new photo replaces the old one: the old file goes while its line still points at it (storage rule)
  if (w.photo && w.id && w.photoPath) await sb.storage.from(BUCKET).remove([w.photoPath]).catch(() => undefined);
  if (w.photo) {
    photoPath = `waste/${id}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(photoPath, w.photo, { contentType: w.photo.type || "image/jpeg" });
    if (error) throw error;
  }
  const branch = w.branchId ?? (branchNow() !== ALL ? branchNow() : undefined);
  const row = {
    day: w.day,
    item: w.item.trim(),
    qty: w.qty,
    unit: w.unit.trim(),
    amount: w.amount,
    reason: w.reason,
    note: w.note.trim(),
    photo_path: photoPath,
    ...(branch ? { branch_id: branch } : {}),
  };
  const { error } = w.id ? await sb.from("waste_logs").update(row).eq("id", w.id) : await sb.from("waste_logs").insert({ id, ...row });
  if (error) throw error;
  await reloadWaste();
}

export async function removeWaste(w: WasteLog) {
  const sb = supabaseBrowser();
  // The photo first: the storage rule lets its line's owner remove it only while the line exists
  if (w.photoPath) await sb.storage.from(BUCKET).remove([w.photoPath]).catch(() => undefined);
  const { error } = await sb.from("waste_logs").delete().eq("id", w.id);
  if (error) throw error;
  await reloadWaste();
}

export async function wastePhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
