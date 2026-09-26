// Batch upload queue (step 6): up to MAX_PHOTOS photos read by the AI at the same time.
// Kept in module memory so it survives moving between screens; the database replaces it in step 5.

import { useSyncExternalStore } from "react";
import { type ExtractErrorCode, MAX_PHOTOS } from "./extract-schema";
import { normalize } from "./normalize";
import { checkPhoto, type PhotoIssue } from "./photo-quality";
import { withVendor } from "./vendor-store";
import type { VendorFix } from "./vendors";
import type { LedgerDoc } from "./types";

export { MAX_PHOTOS };

/** "check" = the photo looks dark, blurry or small: waiting for the person to retake it or read it anyway */
export type UploadStatus = "preparing" | "check" | "reading" | "done" | "failed" | "stopped";
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
}

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const photos = new Map<string, File>();
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
async function preparePhoto(file: File): Promise<File> {
  let source: Blob = file;
  if (/image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    source = Array.isArray(out) ? out[0] : out;
  }
  const imageCompression = (await import("browser-image-compression")).default;
  const input = source instanceof File ? source : new File([source], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  return imageCompression(input, { maxWidthOrHeight: 2400, maxSizeMB: 2, fileType: "image/jpeg", initialQuality: 0.88, useWebWorker: true });
}

async function read(id: string) {
  const photo = photos.get(id);
  if (!photo) return;
  const ctrl = new AbortController();
  aborts.set(id, ctrl);
  patch(id, { status: "reading", startedAt: Date.now(), finishedAt: null, error: null });
  try {
    const body = new FormData();
    body.append("photo", photo, "photo.jpg");
    const res = await fetch("/api/extract", { method: "POST", body, signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as { doc?: LedgerDoc; error?: ExtractErrorCode };
    if (res.ok && json.doc) {
      // normalize() again so a reply of any shape still fits the form, then tidy with the vendor dictionary
      const { doc, fixed } = await withVendor(normalize(json.doc));
      patch(id, { status: "done", doc, vendorFixed: fixed, finishedAt: Date.now() });
    }
    else patch(id, { status: "failed", error: json.error ?? "aiFail", finishedAt: Date.now() });
  } catch {
    if (ctrl.signal.aborted) patch(id, { status: "stopped", finishedAt: Date.now() });
    else patch(id, { status: "failed", error: "network", finishedAt: Date.now() });
  } finally {
    aborts.delete(id);
  }
}

/** Add photos (extra ones beyond the limit are ignored) and start reading them all at once. Returns how many were accepted. */
export function addPhotos(files: File[]): number {
  const room = Math.max(0, MAX_PHOTOS - items.length);
  const accepted = files.slice(0, room);
  for (const file of accepted) {
    const id = crypto.randomUUID();
    items = [...items, { id, name: file.name, status: "preparing", preview: null, startedAt: Date.now(), finishedAt: null, error: null, doc: null, vendorFixed: [], issues: [] }];
    emit();
    preparePhoto(file)
      .then(async (jpeg) => {
        photos.set(id, jpeg);
        patch(id, { preview: URL.createObjectURL(jpeg) });
        // A photo the AI would likely misread waits for the person first (retake, or read anyway)
        const issues = await checkPhoto(jpeg);
        if (issues.length) return patch(id, { status: "check", issues, finishedAt: Date.now() });
        return read(id);
      })
      .catch(() => patch(id, { status: "failed", error: "badImage", finishedAt: Date.now() }));
  }
  return accepted.length;
}

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
  items = items.filter((x) => x.id !== id);
  emit();
}

/** Keep edits made on the review screen when going back to the list */
export const updateDoc = (id: string, doc: LedgerDoc) => patch(id, { doc });
