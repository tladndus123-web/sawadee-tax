// Form field labels in the *form* languages (th / en / ja), independent of the UI locale.
// Source of truth: messages/{th,en,ja}.json → labels, docType, copyKind.

import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import th from "@/messages/th.json";
import { type CopyKind, type DocType, FORM_LANGS, type FormLang, type Tri } from "./types";

const M = { th, en, ja } as const;

/** "all" shows th + en + ja together */
export type FormMode = "all" | FormLang;
export type LabelKey = keyof typeof th.labels;

export const langsFor = (mode: FormMode): readonly FormLang[] => (mode === "all" ? FORM_LANGS : [mode]);

export const LABEL_KEYS = Object.keys(th.labels) as LabelKey[];

/** Label overrides from the company form settings */
export type LabelOverrides = Partial<Record<LabelKey, Partial<Record<FormLang, string>>>>;

/** Default (messages) label */
export const defaultLabel = (key: LabelKey, lang: FormLang): string => M[lang].labels[key];

export const formLabel = (key: LabelKey, lang: FormLang, over?: LabelOverrides): string =>
  over?.[key]?.[lang] || defaultLabel(key, lang);

/** [[lang, text], …] for the current form mode */
export const pickLabel = (key: LabelKey, mode: FormMode, over?: LabelOverrides): [FormLang, string][] =>
  langsFor(mode).map((lg) => [lg, formLabel(key, lg, over)]);

/** "Tel. · โทร. · 電話" style one-liner */
export const joinLabel = (key: LabelKey, mode: FormMode, sep = " · ", over?: LabelOverrides): string =>
  pickLabel(key, mode, over)
    .map(([, x]) => x)
    .join(sep);

/** Pick filled values of a Tri for the mode */
export const pickTri = (value: Tri | null | undefined, mode: FormMode): [FormLang, string][] =>
  langsFor(mode)
    .map((lg): [FormLang, string] => [lg, value?.[lg] ?? ""])
    .filter(([, x]) => x);

export const joinTri = (value: Tri | null | undefined, mode: FormMode, sep = " · "): string =>
  pickTri(value, mode)
    .map(([, x]) => x)
    .join(sep);

export const docTypeTri = (t: DocType): Tri => ({ th: th.docType[t], en: en.docType[t], ja: ja.docType[t] });
/** "Signed" / "Not signed" on the form itself, in the form language (not the screen language) */
export const signedTri = (signed: boolean): Tri => {
  const k = signed ? "signed" : "notSigned";
  return { th: th.app[k], en: en.app[k], ja: ja.app[k] };
};
export const copyKindTri = (k: CopyKind): Tri => ({ th: th.copyKind[k], en: en.copyKind[k], ja: ja.copyKind[k] });
