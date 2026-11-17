// A contract read by the AI (계약서함, 2026-11-18; ported from the for-sale version): one photo or one PDF → the contract
// box's form (name, other party, kind, dates, auto-renewal, notice days, amount) and a short note. The person checks the
// form before saving (app) — on LINE the reading is saved as it is and can be fixed in the app. Pure: the answer's
// shape, its cleaning and the prompt (lib/contract-read-server sends it).

import { CONTRACT_KINDS, type ContractKind } from "./contracts";
import { fixDate } from "./thai-tax";

export const READ_LANGS = ["ja", "th", "en", "ko"] as const;
export type ReadLang = (typeof READ_LANGS)[number];
export const isReadLang = (v: unknown): v is ReadLang => (READ_LANGS as readonly unknown[]).includes(v);
export const readLangOf = (v: unknown): ReadLang => (isReadLang(v) ? v : "ja");

export interface ContractReading {
  title: string;
  party: string;
  kind: ContractKind;
  startOn: string | null;
  endOn: string | null;
  autoRenew: boolean;
  /** Days of notice before the end (null = not in the paper) */
  noticeDays: number | null;
  /** The main amount in satang (rent a month, the fee, the total) — only when printed in baht */
  amount: number | null;
  /** One short line: what the contract is for and what the amount is, in the reader's language */
  note: string;
}

export const CONTRACT_READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "party", "kind", "startOn", "endOn", "autoRenew", "noticeDays", "amount", "note"],
  properties: {
    title: { type: "string" },
    party: { type: "string" },
    kind: { type: "string", enum: [...CONTRACT_KINDS] },
    startOn: { type: "string" },
    endOn: { type: "string" },
    autoRenew: { type: "boolean" },
    noticeDays: { type: "integer" },
    amount: { type: "number" },
    note: { type: "string" },
  },
} as const;

const LANG_NAME: Record<ReadLang, string> = { ja: "Japanese", th: "Thai", en: "English", ko: "Korean" };

/** The instructions for the model (the contract goes in the user turn) */
export function contractSystemPrompt(lang: ReadLang, today: string): string {
  const name = LANG_NAME[lang];
  return (
    `You read a contract for the owner of a small business in Thailand and fill in their contract register. The contract may ` +
    `be in Thai, English or another language and may have several pages. Today is ${today}. Write every text field in ${name}, ` +
    `plainly. title = a short name that says what the contract is about (e.g. "Shop lease, Sukhumvit 24", "Cleaning service"). ` +
    `party = the other party's name as printed (company or person; not the business itself — when unsure which side the ` +
    `business is, the landlord / supplier / service provider / employee is the other party). kind = lease (renting a place, ` +
    `a car, equipment), supply (buying or selling goods), service (works, cleaning, marketing, IT, consulting), employment, ` +
    `loan, insurance, partnership (shareholders, joint venture) or other. startOn / endOn = YYYY-MM-DD in the Gregorian ` +
    `calendar (Thai Buddhist years minus 543), "" when not in the paper; an end worked out from a printed start and term ` +
    `counts ("1 year from 1 March 2026" → 2027-02-28). autoRenew = true only when the paper says it renews or continues ` +
    `unless someone gives notice. noticeDays = days of notice needed before the end or to cancel (a month = 30), 0 when not ` +
    `stated. amount = the main amount in Thai baht as a number (monthly rent, the monthly fee, or the total price — the most ` +
    `useful one), 0 when none or not in baht. note = one or two short sentences: what the contract is for and what the ` +
    `amount is (e.g. "Rent ฿45,000 a month, deposit 3 months"). Never invent anything that is not in the paper; no legal advice. ` +
    `When the paper is not a contract or agreement at all, give an empty title.`
  );
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** A day as the model may write it ("2026-03-01", "2569-03-01", "01/03/2569") → ISO in the Gregorian calendar, or null */
export function readDay(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  const [iso] = fixDate(dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : s);
  return iso || null;
}

/** The model's answer → a clean reading, or null when it found no contract */
export function cleanContractReading(raw: unknown): ContractReading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = (CONTRACT_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as ContractKind) : "other";
  let startOn = readDay(r.startOn);
  let endOn = readDay(r.endOn);
  // A start after the end is a misreading: keep neither rather than a wrong pair
  if (startOn && endOn && endOn < startOn) startOn = endOn = null;
  const notice = Number(r.noticeDays);
  const amount = Number(r.amount);
  const out: ContractReading = {
    title: str(r.title, 120),
    party: str(r.party, 120),
    kind,
    startOn,
    endOn,
    autoRenew: r.autoRenew === true,
    noticeDays: Number.isFinite(notice) && notice > 0 ? Math.min(365, Math.round(notice)) : null,
    amount: Number.isFinite(amount) && amount > 0 && amount < 1e12 ? Math.round(amount * 100) : null,
    note: str(r.note, 1000),
  };
  return out.title ? out : null;
}

/** The form's text fields from a reading (empty for what was not found; notice stays as it was when not found) */
export interface ContractFields {
  title: string;
  party: string;
  kind: ContractKind;
  startOn: string;
  endOn: string;
  autoRenew: boolean;
  noticeDays: string | null;
  /** Baht, as typed ("45000" / "45000.5") */
  amount: string;
  note: string;
}
export function readingToFields(r: ContractReading): ContractFields {
  return {
    title: r.title,
    party: r.party,
    kind: r.kind,
    startOn: r.startOn ?? "",
    endOn: r.endOn ?? "",
    autoRenew: r.autoRenew,
    noticeDays: r.noticeDays === null ? null : String(r.noticeDays),
    amount: r.amount === null ? "" : String(r.amount / 100),
    note: r.note,
  };
}
