// Company-wide form settings: block order, hidden fields and label overrides.
// Stored as JSON (company_settings.form_config from step 5). Always read through sanitizeFormConfig().

import type { LabelKey } from "./form-labels";
import type { FormLang } from "./types";

/** Blocks of the organized form, top to bottom (prototype invoiceView order) */
export const BLOCKS = ["header", "title", "parties", "items", "bottom", "words", "signs", "footer"] as const;
export type BlockKey = (typeof BLOCKS)[number];

/** Blocks that can be hidden as a whole (header, parties, items, bottom always stay) */
export const HIDEABLE_BLOCKS: readonly BlockKey[] = ["title", "words", "signs", "footer"];

/**
 * Fields that can be hidden in view mode, grouped by block. Edit mode always shows every field,
 * so nothing read by the AI is lost.
 */
export const HIDEABLE_FIELDS = {
  header: ["sellerAddress", "sellerContact", "saleOffice", "branchCode", "formSerial", "docTypeChip"],
  title: ["copyKind", "docTitleSub"],
  parties: ["custCode", "customerAddress", "customerBranch", "orderNo", "term", "due", "salesArea", "salesRef"],
  items: ["colCode", "colWh", "colUnit", "colPrice"],
  bottom: ["delivery", "terms", "note", "zeroLines", "wht"],
  words: [],
  signs: [],
  footer: [],
} as const satisfies Record<BlockKey, readonly string[]>;
export type HideableField = (typeof HIDEABLE_FIELDS)[BlockKey][number];
export const ALL_HIDEABLE_FIELDS: readonly HideableField[] = Object.values(HIDEABLE_FIELDS).flat();

export interface FormConfig {
  version: 1;
  order: BlockKey[];
  hiddenBlocks: BlockKey[];
  hidden: HideableField[];
  /** Per-language replacement for a form label; empty / missing = default */
  labels: Partial<Record<LabelKey, Partial<Record<FormLang, string>>>>;
}

export const DEFAULT_FORM_CONFIG: FormConfig = {
  version: 1,
  order: [...BLOCKS],
  hiddenBlocks: [],
  hidden: [],
  labels: {},
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Accept anything (stored JSON, form state) and return a valid config. */
export function sanitizeFormConfig(input: unknown, labelKeys?: readonly string[]): FormConfig {
  const a = isObj(input) ? input : {};
  // Order: known blocks once each, missing ones appended in default order
  const given = Array.isArray(a.order) ? a.order.filter((b): b is BlockKey => BLOCKS.includes(b as BlockKey)) : [];
  const order = [...new Set(given)];
  for (const b of BLOCKS) if (!order.includes(b)) order.push(b);

  const hiddenBlocks = Array.isArray(a.hiddenBlocks)
    ? [...new Set(a.hiddenBlocks.filter((b): b is BlockKey => HIDEABLE_BLOCKS.includes(b as BlockKey)))]
    : [];
  const hidden = Array.isArray(a.hidden)
    ? [...new Set(a.hidden.filter((f): f is HideableField => ALL_HIDEABLE_FIELDS.includes(f as HideableField)))]
    : [];

  const labels: FormConfig["labels"] = {};
  if (isObj(a.labels)) {
    for (const [k, v] of Object.entries(a.labels)) {
      if (labelKeys && !labelKeys.includes(k)) continue;
      if (!isObj(v)) continue;
      const entry: Partial<Record<FormLang, string>> = {};
      for (const lg of ["th", "en", "ja"] as const) {
        const s = typeof v[lg] === "string" ? (v[lg] as string).trim().slice(0, 80) : "";
        if (s) entry[lg] = s;
      }
      if (Object.keys(entry).length) labels[k as LabelKey] = entry;
    }
  }
  return { version: 1, order, hiddenBlocks, hidden, labels };
}

export const isDefaultFormConfig = (c: FormConfig): boolean =>
  JSON.stringify(sanitizeFormConfig(c)) === JSON.stringify(DEFAULT_FORM_CONFIG);
