// What an admin should look at before approving a claim (owner, 2026-10-28: "수상한 청구 자동 표시"; ported 2026-10-27). Rules over what
// the AI read from the receipt — no extra AI call:
// - "dupPhoto": the same photo was claimed before, or is already a document in the ledger;
// - "dupReceipt": another claim with the same shop, day and amount;
// - "personal": the receipt's lines or the shop look personal (alcohol, cigarettes, lottery, games …);
// - "mismatch": the amount typed differs from the amount the AI read on the receipt;
// - "old": the receipt is older than 30 days when claimed (not for a ledger document moved to a claim);
// - "big": far above what this person usually claims — the same rule as the 5-day report's "unusual spend"
//   (lib/anomalies: 3× their median, at least ฿5,000, with 3 earlier claims or more);
// - "noPhoto": no receipt at all.

import { docAmount, type Claim } from "./expenses";
import { BIG_HISTORY, BIG_MIN, BIG_TIMES } from "./anomalies";
import { findDuplicate } from "./photo-hash";

export type ClaimFlag = "dupPhoto" | "dupReceipt" | "personal" | "mismatch" | "old" | "big" | "noPhoto";
export interface Flag {
  kind: ClaimFlag;
  /** The other claim or document it points at */
  ref?: string;
  /** For "mismatch": the amount read (satang); for "old": days; for "big": the person's usual (satang); for "personal": the word */
  n?: number;
  word?: string;
}

/** Words that make a receipt look personal (Thai, English, Japanese, Korean; brands sold in Thailand) */
const PERSONAL = [
  /\b(beer|wine|whisk(e)?y|vodka|gin|rum|soju|sake|liquor|alcohol)\b/i,
  /\b(leo|chang|singha|heineken|tiger|carlsberg|asahi|hoegaarden|regency|sangsom|hong ?thong|blend ?285|smirnoff|johnnie ?walker|jack ?daniel)\b/i,
  /เบียร์|เหล้า|ไวน์|สุรา|วิสกี้|บุหรี่|ยาสูบ|ลอตเตอรี่|สลากกินแบ่ง|หวย/,
  /\b(cigarette|cigar|tobacco|vape|e-?cig|marlboro|lucky ?strike|lottery)\b/i,
  /ビール|ワイン|酒|焼酎|ウイスキー|たばこ|タバコ|煙草/,
  /맥주|소주|와인|양주|위스키|담배|복권/,
  /\b(game|playstation|nintendo|steam ?wallet|garena|netflix|spotify)\b/i,
];

export function personalWord(texts: string[]): string | null {
  for (const t of texts) {
    for (const re of PERSONAL) {
      const m = t.match(re);
      if (m) return m[0];
    }
  }
  return null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface CheckContext {
  /** Every claim of the company (or what the reader may see) */
  claims: Claim[];
  /** Photo fingerprints of the ledger's documents */
  ledgerPhotos?: { id: string; hash: string }[];
}

export function claimFlags(c: Claim, ctx: CheckContext): Flag[] {
  const out: Flag[] = [];
  const hash = c.photoHash;
  const others = ctx.claims.filter((o) => o.id !== c.id && o.status !== "rejected");
  if (hash) {
    const dupClaim = findDuplicate(hash, others.flatMap((o) => (o.photoHash ? [{ id: o.id, hash: o.photoHash }] : [])));
    // A claim already paid back is itself a ledger document: only another document counts as "already in the ledger"
    const dupDoc = findDuplicate(hash, (ctx.ledgerPhotos ?? []).filter((d) => d.id !== c.id && d.id !== c.documentId));
    if (dupClaim) out.push({ kind: "dupPhoto", ref: dupClaim.id });
    else if (dupDoc) out.push({ kind: "dupPhoto", ref: dupDoc.id });
  }
  if (!out.length && c.seller.trim()) {
    const same = others.find((o) => o.day === c.day && o.amount === c.amount && norm(o.seller) === norm(c.seller));
    if (same) out.push({ kind: "dupReceipt", ref: same.id });
  }
  const lines = c.doc ? c.doc.items.flatMap((i) => [i.desc.th, i.desc.en, i.desc.ja]) : [];
  const word = personalWord([...lines, c.seller, c.note].filter(Boolean));
  if (word) out.push({ kind: "personal", word });
  const read = docAmount(c.doc);
  if (read > 0 && Math.abs(read - c.amount) > Math.max(100, Math.round(read * 0.01))) out.push({ kind: "mismatch", n: read });
  const age = daysBetween(c.day, c.createdAt || c.day);
  // (not for a document moved over from the ledger: it was booked long ago, that is the point)
  if (age > 30 && !c.documentId) out.push({ kind: "old", n: age });
  const mine = others.filter((o) => (c.userId ? o.userId === c.userId : o.name === c.name) && o.createdAt < c.createdAt).map((o) => o.amount);
  if (mine.length >= BIG_HISTORY) {
    const usual = median(mine);
    if (c.amount >= usual * BIG_TIMES && c.amount >= BIG_MIN * 100) out.push({ kind: "big", n: usual });
  }
  if (!c.photoPath) out.push({ kind: "noPhoto" });
  return out;
}
