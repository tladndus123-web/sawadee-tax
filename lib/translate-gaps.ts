// Type in one language, get the other two: when a document is saved, every {th, en, ja} field whose text was
// changed in exactly one language is sent for translation into the other two (overwriting their old text).
// Fields nobody touched are never translated, so saving an AI reading as it is costs nothing.

import { FORM_LANGS, type FormLang, type LedgerDoc, type Tri } from "./types";

export type TranslateJob = { path: string; from: FormLang; text: string; to: FormLang[] };

/** Every {th, en, ja} field of a document, by path ("seller.name", "items.2.desc", "terms.0", …) */
export function triFields(doc: LedgerDoc): [string, Tri][] {
  const out: [string, Tri][] = [
    ["docTitle", doc.docTitle],
    ["seller.name", doc.seller.name],
    ["seller.address", doc.seller.address],
    ["seller.branch", doc.seller.branch],
    ["customer.name", doc.customer.name],
    ["customer.branch", doc.customer.branch],
    ["customer.address", doc.customer.address],
    ["term", doc.term],
    ["sales.name", doc.sales.name],
    ["sales.area", doc.sales.area],
    ["delivery.note", doc.delivery.note],
    ["delivery.place", doc.delivery.place],
    ["delivery.person", doc.delivery.person],
    ["words", doc.words],
    ["note", doc.note],
  ];
  doc.items.forEach((it, i) => out.push([`items.${i}.desc`, it.desc], [`items.${i}.unit`, it.unit]));
  doc.terms.forEach((t, i) => out.push([`terms.${i}`, t]));
  if (doc.signs.deliverer) out.push(["signs.deliverer", doc.signs.deliverer]);
  return out;
}

const getPath = (doc: LedgerDoc, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), doc);

/** What to translate: fields changed in exactly one language (compared with the document as it was opened) */
export function translationJobs(doc: LedgerDoc, before: LedgerDoc): TranslateJob[] {
  const jobs: TranslateJob[] = [];
  for (const [path, now] of triFields(doc)) {
    const was = getPath(before, path) as Tri | undefined;
    const changed = FORM_LANGS.filter((l) => (now[l] ?? "") !== (was?.[l] ?? ""));
    if (changed.length !== 1) continue;
    const from = changed[0];
    const text = now[from].trim();
    if (!text) continue;
    jobs.push({ path, from, text, to: FORM_LANGS.filter((l) => l !== from) });
  }
  return jobs;
}

/** Put the translations in (a copy of) the document; a job without a result leaves its field as typed */
export function applyTranslations(doc: LedgerDoc, jobs: TranslateJob[], results: Partial<Record<FormLang, string>>[]): LedgerDoc {
  const out = structuredClone(doc);
  jobs.forEach((job, i) => {
    const tri = getPath(out, job.path) as Tri | undefined;
    const r = results[i];
    if (!tri || !r) return;
    for (const l of job.to) if (typeof r[l] === "string" && r[l]!.trim()) tri[l] = r[l]!.trim();
  });
  return out;
}
