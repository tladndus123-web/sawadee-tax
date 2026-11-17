"use client";

// Contract box (public.contracts), browser side: the person's own session reads and writes, so the database's rules
// (admins only) decide. A picked file goes into the private documents bucket under "contracts/<id>/…" right away
// (uploadContractFile), so the AI can read it from there (/api/contracts/read) before the form is saved; a file left
// behind by a cancelled or replaced form is taken back (dropUpload).

import type { ContractReading, ReadLang } from "./contract-read";
import { type Contract, type ContractKind, checkFile, contractFilePath, isContractPath, rowToContract } from "./contracts";
import { fetchAll } from "./fetch-all";
import { supabaseBrowser } from "./supabase/client";

const BUCKET = "documents";

export async function loadContracts(): Promise<Contract[]> {
  const rows = await fetchAll<Record<string, unknown>>(() => supabaseBrowser().from("contracts").select("*"));
  return rows.map(rowToContract);
}

export interface Uploaded {
  path: string;
  name: string;
  type: string;
}

/** Puts a picked file in the contract's folder (before the form is saved). Throws "file:<why>" for a file the box refuses. */
export async function uploadContractFile(contractId: string, file: File): Promise<Uploaded> {
  const ok = checkFile(file);
  if (!ok.ok) throw new Error(`file:${ok.why}`);
  const path = contractFilePath(contractId, file.name);
  const up = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: ok.type });
  if (up.error) throw up.error;
  return { path, name: file.name.slice(0, 200), type: ok.type };
}

async function removeFile(path: string) {
  try {
    if (isContractPath(path)) await supabaseBrowser().storage.from(BUCKET).remove([path]);
  } catch {
    // A file left behind never blocks the person
  }
}

/** A file uploaded for a form that was then cancelled or replaced */
export async function dropUpload(u: Uploaded | null | undefined): Promise<void> {
  if (u) await removeFile(u.path);
}

export type ReadAnswer = { ok: true; reading: ContractReading } | { ok: false; code: "noKey" | "none" | "failed" | "file" | "busy" };

/** The AI reads an uploaded file */
export async function readContractFile(path: string, lang: ReadLang): Promise<ReadAnswer> {
  try {
    const res = await fetch("/api/contracts/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, lang }) });
    const body = (await res.json().catch(() => ({}))) as { reading?: ContractReading; error?: string };
    if (res.ok && body.reading) return { ok: true, reading: body.reading };
    const code = body.error === "noKey" || body.error === "none" || body.error === "file" ? body.error : res.status === 429 ? "busy" : "failed";
    return { ok: false, code };
  } catch {
    return { ok: false, code: "failed" };
  }
}

export interface ContractInput {
  id: string;
  /** A new contract (insert) or one being changed (update) */
  isNew: boolean;
  title: string;
  party: string;
  kind: ContractKind;
  startOn: string | null;
  endOn: string | null;
  autoRenew: boolean;
  noticeDays: number;
  /** Satang */
  amount: number | null;
  note: string;
  branchId?: string | null;
}

/** Adds or changes a contract; a newly uploaded file replaces the old one (which is removed). Returns the saved contract. */
export async function saveContract(input: ContractInput, upload?: Uploaded | null, old?: Contract | null): Promise<Contract> {
  const sb = supabaseBrowser();
  const row = {
    title: input.title.trim().slice(0, 120),
    party: input.party.trim().slice(0, 120),
    kind: input.kind,
    start_on: input.startOn || null,
    end_on: input.endOn || null,
    auto_renew: input.autoRenew,
    notice_days: Math.min(365, Math.max(0, Math.floor(input.noticeDays))),
    amount: input.amount === null ? null : Math.max(0, Math.round(input.amount)),
    note: input.note.trim().slice(0, 1000),
    ...(input.branchId !== undefined ? { branch_id: input.branchId } : {}),
    ...(upload ? { file_path: upload.path, file_name: upload.name, file_type: upload.type } : {}),
  };
  const q = input.isNew ? sb.from("contracts").insert({ id: input.id, ...row }) : sb.from("contracts").update(row).eq("id", input.id);
  const { data, error } = await q.select("*").single();
  if (error) throw error;
  if (upload && old?.filePath && old.filePath !== upload.path) await removeFile(old.filePath);
  return rowToContract(data as Record<string, unknown>);
}

/** Takes the file off a contract (and out of storage) */
export async function removeContractFile(c: Contract): Promise<Contract> {
  const { data, error } = await supabaseBrowser().from("contracts").update({ file_path: null, file_name: null, file_type: null }).eq("id", c.id).select("*").single();
  if (error) throw error;
  if (c.filePath) await removeFile(c.filePath);
  return rowToContract(data as Record<string, unknown>);
}

export async function deleteContract(c: Contract): Promise<void> {
  const { error } = await supabaseBrowser().from("contracts").delete().eq("id", c.id);
  if (error) throw error;
  if (c.filePath) await removeFile(c.filePath);
}

/** A 10-minute link to the contract's file (only a path inside the contracts folder is signed) */
export async function contractFileUrl(path: string): Promise<string | null> {
  if (!isContractPath(path)) return null;
  const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
