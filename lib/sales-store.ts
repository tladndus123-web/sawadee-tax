"use client";

// Sales in Supabase (public.sales): one line per day and channel. Everyone who is a member reads and adds;
// only admins delete; closed months are frozen by the database. Closing-report photos go to the "documents"
// bucket under sales/.

import { useEffect, useSyncExternalStore } from "react";
import { lockedMonths } from "./month-lock-store";
import type { ImportDay } from "./pos-import";
import { CHANNELS, type Channel, type Sale } from "./sales";
import { supabaseBrowser } from "./supabase/client";

interface SaleRow {
  id: string;
  sale_date: string;
  channel: string;
  doc_from: string;
  doc_to: string;
  bills: number;
  gross: number | string;
  vat: number | string;
  exempt: number | string;
  note: string;
  photo_path: string | null;
  source: Sale["source"];
}

const toSale = (r: SaleRow): Sale => ({
  id: r.id,
  date: r.sale_date,
  channel: (CHANNELS as readonly string[]).includes(r.channel) ? (r.channel as Channel) : "other",
  docFrom: r.doc_from ?? "",
  docTo: r.doc_to ?? "",
  bills: Number(r.bills) || 0,
  gross: Number(r.gross) || 0,
  vat: Number(r.vat) || 0,
  exempt: Number(r.exempt) || 0,
  note: r.note ?? "",
  photoPath: r.photo_path,
  source: r.source,
});

let sales: Sale[] = [];
let loaded = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function reload() {
  const { data, error } = await supabaseBrowser().from("sales").select("*").order("sale_date", { ascending: false });
  if (error) throw error;
  sales = (data as SaleRow[]).map(toSale);
  loaded = true;
  emit();
}

export function useSales(): { sales: Sale[]; loaded: boolean } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sales,
    () => sales,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reload().catch(() => (started = false));
  }, []);
  return { sales: snap, loaded };
}

/**
 * Save a day of one channel. A new line for a day and channel that already exist replaces it (a re-shot closing
 * report corrects the numbers instead of counting the day twice). Returns the id.
 */
export async function saveSale(s: Omit<Sale, "id" | "photoPath"> & { id?: string; photoPath?: string | null }, photo?: File | null): Promise<string> {
  const sb = supabaseBrowser();
  let photoPath = s.photoPath ?? null;
  if (photo) {
    photoPath = `sales/${s.date}-${s.channel}-${Date.now()}.${photo.type === "application/pdf" ? "pdf" : "jpg"}`;
    const { error } = await sb.storage.from("documents").upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
    if (error) throw error;
  }
  const row = {
    sale_date: s.date,
    channel: s.channel,
    doc_from: s.docFrom.trim(),
    doc_to: s.docTo.trim(),
    bills: Math.max(0, Math.round(s.bills) || 0),
    gross: s.gross,
    vat: s.vat,
    exempt: s.exempt,
    note: s.note.trim(),
    photo_path: photoPath,
    source: s.source,
  };
  const q = s.id
    ? sb.from("sales").update(row).eq("id", s.id).select("id").single()
    : sb.from("sales").upsert(row, { onConflict: "sale_date,channel" }).select("id").single();
  const { data, error } = await q;
  if (error) throw error;
  await reload();
  return (data as { id: string }).id;
}

/**
 * Save many days at once (POS file import). Each day and channel replaces what is there; days in a closed month
 * are left out and reported back, so one closed month never blocks the rest.
 */
export async function saveSalesBulk(days: ImportDay[]): Promise<{ saved: number; locked: number; invalid: number }> {
  const closed = await lockedMonths();
  // The database refuses negative days (refunds only) and VAT above the sales; they are left for a person
  const valid = days.filter((d) => d.gross >= 0 && d.vat >= 0 && d.exempt >= 0 && d.vat + d.exempt <= d.gross);
  const open = valid.filter((d) => !closed.has(d.date.slice(0, 7)));
  if (open.length) {
    const rows = open.map((d) => ({
      sale_date: d.date,
      channel: d.channel,
      doc_from: d.docFrom,
      doc_to: d.docTo,
      bills: Math.max(0, d.bills),
      gross: d.gross,
      vat: d.vat,
      exempt: d.exempt,
      note: "",
      source: "excel" as const,
    }));
    const { error } = await supabaseBrowser().from("sales").upsert(rows, { onConflict: "sale_date,channel" });
    if (error) throw error;
  }
  await reload();
  return { saved: open.length, locked: valid.length - open.length, invalid: days.length - valid.length };
}

/** Admins only (the database refuses anyone else) */
export async function deleteSale(id: string) {
  const { data, error } = await supabaseBrowser().from("sales").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not allowed");
  await reload();
}

/** A 1-hour link to a closing-report photo */
export async function salePhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabaseBrowser().storage.from("documents").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
