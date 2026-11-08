// Which parts of the message files go into lib/form-text.json (scripts/form-text.mts; checked by lib/form-text.test.ts)

type Messages = { labels: Record<string, string>; docType: Record<string, string>; copyKind: Record<string, string>; app: Record<string, string>; report: Record<string, string> };

const one = (m: Messages, report: boolean) => ({
  labels: m.labels,
  docType: m.docType,
  copyKind: m.copyKind,
  app: { signed: m.app.signed, notSigned: m.app.notSigned },
  ...(report ? { report: m.report } : {}),
});

export const formText = (m: { th: Messages; en: Messages; ja: Messages }) => ({ th: one(m.th, true), en: one(m.en, false), ja: one(m.ja, false) });
