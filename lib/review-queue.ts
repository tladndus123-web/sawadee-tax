// "Check one by one" (like freee's confirm flow): the documents that still need a person's look — drafts
// and saved documents with a failing automatic check — oldest first, so a month is worked through in order.
// Documents already confirmed or skipped in this run are passed in and left out.

import { needsCheck } from "./dashboard";
import type { LedgerDoc } from "./types";

type QueueEntry = { id: string; status: "draft" | "final"; doc: LedgerDoc; createdAt: number; deletedAt: number | null; ackFlags?: string[] };

export function reviewQueue(entries: QueueEntry[], companyTaxId: string, today: string): string[] {
  const live = entries.filter((e) => e.deletedAt === null);
  const saved = live.filter((e) => e.status === "final");
  const flagged = needsCheck(saved.map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), companyTaxId, today);
  return live
    .filter((e) => e.status === "draft" || flagged.has(e.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => e.id);
}

/** The next document to open after `current`, or null when the run is finished */
export const nextInQueue = (queue: string[], current: string, done: ReadonlySet<string>): string | null =>
  queue.find((id) => id !== current && !done.has(id)) ?? null;

/** "3 / 7": how far this run has come, counting what is done plus what is still waiting */
export function queueProgress(queue: string[], current: string, done: ReadonlySet<string>): { at: number; total: number } {
  const waiting = queue.filter((id) => id !== current && !done.has(id)).length;
  return { at: done.size + 1, total: done.size + 1 + waiting };
}
