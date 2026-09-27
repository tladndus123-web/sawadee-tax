// Batch upload queue (step 6): up to MAX_QUEUE photos waiting, MAX_PHOTOS of them read by the AI at the same
// time (the rest wait their turn — continuous shooting can add many quickly).
// Kept in module memory so it survives moving between screens; the database replaces it in step 5.

import { useSyncExternalStore } from "react";
import { type ExtractErrorCode, MAX_PHOTOS, MAX_QUEUE } from "./extract-schema";
import { normalize } from "./normalize";
import { isPdf, pdfToJpeg } from "./pdf-render";
import { checkPhoto, type PhotoIssue } from "./photo-quality";
import { isSlip } from "./slip-tiles";
import { runChecks } from "./checks";
import { companyTaxId } from "./company-store";
import { saveEntry } from "./ledger-store";
import { supabaseBrowser } from "./supabase/client";
import { withVendor } from "./vendor-store";
import { canAutoRegister, type VendorFix } from "./vendors";
import type { LedgerDoc } from "./types";

export { MAX_PHOTOS, MAX_QUEUE };

/** "check" = the photo looks dark, blurry or small: waiting for the person to retake it or read it anyway.
 *  "saved" = the vendor's rule let it go straight into the ledger (every automatic check passed). */
export type UploadStatus = "preparing" | "check" | "queued" | "reading" | "done" | "saved" | "failed" | "stopped";
export type UploadError = ExtractErrorCode | "network";

export interface UploadItem {
  id: string;
  name: string;
  status: UploadStatus;
  /** Object URL of the prepared JPEG (shown next to the form) */
  preview: string | null;
  startedAt: number;
  finishedAt: number | null;
  error: UploadError | null;
  doc: LedgerDoc | null;
  /** Seller fields the vendor dictionary tidied (shown to the user) */
  vendorFixed: VendorFix[];
  /** What looked wrong with the photo (status "check") */
  issues: PhotoIssue[];
  /** Ledger id when it was saved automatically (status "saved") */
  savedId?: string;
}

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const photos = new Map<string, File>();
/** Original PDFs: sent to the AI instead of the picture made from them */
const pdfs = new Map<string, File>();
const aborts = new Map<string, AbortController>();

const emit = () => listeners.forEach((l) => l());
const patch = (id: string, change: Partial<UploadItem>) => {
  items = items.map((it) => (it.id === id ? { ...it, ...change } : it));
  emit();
};

export function useUploadQueue(): UploadItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}

/** Straighten, convert iPhone HEIC and shrink so the photo uploads fast and stays under the API limit. */
export async function preparePhoto(file: File): Promise<File> {
  let source: Blob = file;
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    source = Array.isArray(out) ? out[0] : out;
  }
  const imageCompression = (await import("browser-image-compression")).default;
  const input = source instanceof File ? source : new File([source], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  // A long, narrow slip keeps its width (up to 1200 px) instead of being shrunk by its long side: the
  // server cuts it into pieces for the AI (lib/slip-tiles.ts), and a 2400 px-long slip would be too thin to read.
  let longSide = 2400;
  let maxSizeMB = 2;
  try {
    const bmp = await createImageBitmap(input);
    const [w, h] = [bmp.width, bmp.height];
    bmp.close();
    if (isSlip(w, h)) {
      longSide = Math.max(2400, Math.min(Math.max(w, h), Math.round(Math.min(w, h, 1200) * (Math.max(w, h) / Math.min(w, h))), 9000));
      maxSizeMB = 3.5;
    }
  } catch {
    // can't measure it here: the normal size is fine
  }
  return imageCompression(input, { maxWidthOrHeight: longSide, maxSizeMB, fileType: "image/jpeg", initialQuality: 0.88, useWebWorker: true });
}

// At most MAX_PHOTOS readings run at once; the others wait in order ("queued")
let active = 0;
const waiting: string[] = [];

function read(id: string) {
  if (active >= MAX_PHOTOS) {
    if (!waiting.includes(id)) waiting.push(id);
    patch(id, { status: "queued" });
    return;
  }
  active++;
  void readNow(id).finally(() => {
    active--;
    const next = waiting.shift();
    if (next) read(next);
  });
}

async function readNow(id: string) {
  const photo = photos.get(id);
  if (!photo) return;
  const ctrl = new AbortController();
  aborts.set(id, ctrl);
  patch(id, { status: "reading", startedAt: Date.now(), finishedAt: null, error: null });
  try {
    const body = new FormData();
    const pdf = pdfs.get(id);
    if (pdf) body.append("pdf", pdf, pdf.name || "document.pdf");
    else body.append("photo", photo, "photo.jpg");
    const res = await fetch("/api/extract", { method: "POST", body, signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as { doc?: LedgerDoc; error?: ExtractErrorCode };
    if (res.ok && json.doc) {
      // normalize() again so a reply of any shape still fits the form, then tidy with the vendor dictionary
      const { doc, fixed, vendor } = await withVendor(normalize(json.doc));
      const savedId = vendor?.autoRegister ? await autoSave(doc, vendor, photo, pdfs.get(id) ?? null) : null;
      if (savedId) {
        photos.delete(id);
        patch(id, { status: "saved", doc, vendorFixed: fixed, savedId, finishedAt: Date.now() });
      } else patch(id, { status: "done", doc, vendorFixed: fixed, finishedAt: Date.now() });
    }
    else patch(id, { status: "failed", error: json.error ?? "aiFail", finishedAt: Date.now() });
  } catch {
    if (ctrl.signal.aborted) patch(id, { status: "stopped", finishedAt: Date.now() });
    else patch(id, { status: "failed", error: "network", finishedAt: Date.now() });
  } finally {
    aborts.delete(id);
  }
}

/**
 * Straight into the ledger when the vendor's rule allows it and every automatic check passes — the same checks a
 * person sees, including duplicates in the ledger. Returns the new id, or null to leave it for a person.
 */
async function autoSave(doc: LedgerDoc, vendor: Parameters<typeof canAutoRegister>[1], photo: File, pdf: File | null): Promise<string | null> {
  try {
    const taxId = await companyTaxId();
    const { data: same } = doc.docNo
      ? await supabaseBrowser().from("documents").select("id, doc_no, seller").eq("doc_no", doc.docNo).is("deleted_at", null)
      : { data: [] };
    const others = (same ?? []).map((d) => ({ id: d.id as string, docNo: d.doc_no as string, sellerTaxId: ((d.seller as { taxId?: string } | null)?.taxId as string) ?? "" }));
    const failing = runChecks(doc, { companyTaxId: taxId, others }).filter((c) => !c.ok && !c.na).map((c) => c.key);
    if (!canAutoRegister(doc, vendor, failing)) return null;
    const { id } = await saveEntry(doc, photo, undefined, "final", taxId, pdf);
    return id;
  } catch {
    return null;
  }
}

/** Add photos (extra ones beyond the limit are ignored) and start reading them all at once. Returns how many were accepted. */
export function addPhotos(files: File[]): number {
  const room = Math.max(0, MAX_QUEUE - items.length);
  const accepted = files.slice(0, room);
  for (const file of accepted) {
    const id = crypto.randomUUID();
    items = [...items, { id, name: file.name, status: "preparing", preview: null, startedAt: Date.now(), finishedAt: null, error: null, doc: null, vendorFixed: [], issues: [] }];
    emit();
    const pdf = isPdf(file);
    if (pdf) pdfs.set(id, file);
    (pdf ? pdfToJpeg(file) : preparePhoto(file))
      .then(async (jpeg) => {
        photos.set(id, jpeg);
        patch(id, { preview: URL.createObjectURL(jpeg) });
        // A PDF is sharp by nature; a photo the AI would likely misread waits for the person first
        const issues = pdf ? [] : await checkPhoto(jpeg);
        if (issues.length) return patch(id, { status: "check", issues, finishedAt: Date.now() });
        return read(id);
      })
      .catch(() => patch(id, { status: "failed", error: "badImage", finishedAt: Date.now() }));
  }
  return accepted.length;
}

/** The original PDF a photo was drawn from (null for photos), stored with the document too */
export const getOriginal = (id: string): File | null => pdfs.get(id) ?? null;

/** The prepared JPEG, stored with the document when it is saved */
export const getPhoto = (id: string): File | null => photos.get(id) ?? null;

export const retryPhoto = (id: string) => void read(id);
/** Read a photo the check flagged, as it is */
export const readAnyway = (id: string) => void read(id);
export const stopPhoto = (id: string) => aborts.get(id)?.abort();

export function removePhoto(id: string) {
  aborts.get(id)?.abort();
  const it = items.find((x) => x.id === id);
  if (it?.preview) URL.revokeObjectURL(it.preview);
  photos.delete(id);
  pdfs.delete(id);
  const w = waiting.indexOf(id);
  if (w >= 0) waiting.splice(w, 1);
  items = items.filter((x) => x.id !== id);
  emit();
}

/** Keep edits made on the review screen when going back to the list */
export const updateDoc = (id: string, doc: LedgerDoc) => patch(id, { doc });
