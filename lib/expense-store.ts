"use client";

// Expense claims (public.expense_claims) and their settings (company_settings.expenses). Staff see and change their
// own waiting claims; admins see all, decide them and pay them back (the database enforces both). Paying back puts
// the receipt into the ledger: the document gets the claim's id, so the photo already sits in its folder.

import { useEffect, useSyncExternalStore } from "react";
import { docToRow } from "./db-map";
import { type Claim, claimDoc, type ExpenseSettings, type PaidHow, readExpenseSettings, rowToClaim } from "./expenses";
import { reloadLedger } from "./ledger-store";
import { photoHash } from "./photo-hash";
import { ALL } from "./branches";
import { branchNow } from "./branch-store";
import { supabaseBrowser } from "./supabase/client";
import type { Category } from "./types";

type Snap = { claims: Claim[]; settings: ExpenseSettings; loaded: boolean };
let snap: Snap = { claims: [], settings: readExpenseSettings(null), loaded: false };
const listeners = new Set<() => void>();
let started = false;

const toClaim = rowToClaim;

export async function reloadClaims() {
  const sb = supabaseBrowser();
  const [c, s] = await Promise.all([sb.from("expense_claims").select("*").order("created_at", { ascending: false }).limit(3000), sb.from("company_settings").select("expenses").eq("id", 1).maybeSingle()]);
  if (c.error) throw c.error;
  snap = { claims: (c.data ?? []).map(toClaim), settings: readExpenseSettings(s.data?.expenses), loaded: true };
  listeners.forEach((f) => f());
}

export function useClaims(): Snap {
  const s = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => snap,
    () => snap,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void reloadClaims().catch(() => (started = false));
  }, []);
  return s;
}

const BUCKET = "documents";

export interface ClaimInput {
  id?: string;
  name: string;
  day: string;
  seller: string;
  amount: number;
  category: Category;
  note: string;
  doc: Claim["doc"];
}

/** Adds or changes a claim; a new photo goes into the claim's folder. Returns the claim (its status may be approved already). */
export async function saveClaim(c: ClaimInput, photo?: Blob | null): Promise<Claim> {
  const sb = supabaseBrowser();
  const id = c.id ?? crypto.randomUUID();
  let photoPath: string | undefined;
  let hash: string | null = null;
  if (photo) {
    hash = await photoHash(photo);
    // In the claim's own folder: once paid back, the ledger document (same id) already has its photo
    photoPath = `${id}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(photoPath, photo, { contentType: photo.type || "image/jpeg" });
    if (error) throw error;
  }
  const row = {
    name: c.name.trim().slice(0, 80),
    day: c.day,
    seller: c.seller.trim().slice(0, 120),
    amount: Math.round(c.amount),
    category: c.category,
    note: c.note.trim().slice(0, 500),
    doc: c.doc,
    ...(photoPath ? { photo_path: photoPath, photo_hash: hash } : {}),
  };
  // A new claim goes to the branch being worked in (the database puts a member's claim in a branch they may see)
  const branch = branchNow();
  const { data, error } = c.id
    ? await sb.from("expense_claims").update(row).eq("id", id).select("*").single()
    : await sb.from("expense_claims").insert({ id, ...row, ...(branch && branch !== ALL ? { branch_id: branch } : {}) }).select("*").single();
  if (error) throw error;
  await reloadClaims();
  return toClaim(data as Record<string, unknown>);
}

export async function removeClaim(id: string) {
  const { error } = await supabaseBrowser().from("expense_claims").delete().eq("id", id);
  if (error) throw error;
  await reloadClaims();
}

/** Approve, reject (with a reason) or send back to waiting */
export async function decideClaims(ids: string[], status: "approved" | "rejected" | "pending", reason = "") {
  const { error } = await supabaseBrowser().from("expense_claims").update({ status, reason: status === "rejected" ? reason.trim().slice(0, 300) : "" }).in("id", ids);
  if (error) throw error;
  if (status !== "pending") ids.forEach(notifyClaim);
  await reloadClaims();
}

/**
 * Paid back: each claim becomes a paid document in the ledger (id = the claim's id, its photo kept) and is marked
 * paid. A claim already in the ledger is only marked.
 */
export async function payClaims(claims: Claim[], paidOn: string, how: PaidHow, companyTaxId?: string) {
  const sb = supabaseBrowser();
  for (const c of claims) {
    if (!c.documentId) {
      const doc = claimDoc(c, paidOn, how);
      // In the claim's branch
      const { row, items } = docToRow({ ...doc, id: c.id, ...(c.branchId ? { branchId: c.branchId } : {}) }, "reviewed", companyTaxId);
      const { error } = await sb.rpc("save_document", { p_id: c.id, p_row: c.photoPath ? { ...row, photo_path: c.photoPath } : row, p_items: items });
      if (error) throw error;
    }
    const { error } = await sb.from("expense_claims").update({ status: "paid", paid_on: paidOn, paid_how: how, document_id: c.documentId ?? c.id }).eq("id", c.id);
    if (error) throw error;
    notifyClaim(c.id);
  }
  await Promise.all([reloadClaims(), reloadLedger()]);
}

export async function claimPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function saveExpenseSettings(s: ExpenseSettings) {
  const { data, error } = await supabaseBrowser().from("company_settings").update({ expenses: s }).eq("id", 1).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not saved");
  snap = { ...snap, settings: s };
  listeners.forEach((f) => f());
}

/** LINE: a new claim to the admins, a decided / paid one to the employee (best effort; nothing without a LINE channel) */
export function notifyClaim(id: string) {
  void fetch("/api/expenses/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
}
