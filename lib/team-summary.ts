// Who did what in a month (owner's request 2026-09-28): per member, documents uploaded, documents edited,
// deleted / restored, and warnings marked fine ("문제 없음"). From the audit trail (document_events) and the
// documents' ack stamps. Automatic system edits (no person) are left out. Months follow Bangkok time.

export interface TeamEvent {
  userId: string | null;
  documentId: string;
  action: "create" | "update" | "delete" | "restore";
  at: string;
}

export interface TeamAck {
  ackBy: string | null;
  ackAt: string | null;
}

export interface TeamRow {
  userId: string;
  created: number;
  /** Different documents edited (several saves of one document count once) */
  edited: number;
  deleted: number;
  restored: number;
  acked: number;
  /** Last thing this person did in the month (ISO time) */
  lastAt: string;
}

/** YYYY-MM of an ISO time, in Bangkok (UTC+7, no daylight saving) */
export const bangkokMonth = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 7);

/** The month's bounds as ISO times, for the database query */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - 7 * 3_600_000).toISOString(), to: new Date(Date.UTC(y, m, 1) - 7 * 3_600_000).toISOString() };
}

export function teamSummary(events: TeamEvent[], acks: TeamAck[], month: string): TeamRow[] {
  const rows = new Map<string, TeamRow & { editedIds: Set<string> }>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { userId: id, created: 0, edited: 0, deleted: 0, restored: 0, acked: 0, lastAt: "", editedIds: new Set() }));
    return r;
  };
  const seen = (r: TeamRow, at: string) => {
    if (at > r.lastAt) r.lastAt = at;
  };
  for (const e of events) {
    if (!e.userId || bangkokMonth(e.at) !== month) continue;
    const r = row(e.userId);
    if (e.action === "create") r.created += 1;
    else if (e.action === "update") r.editedIds.add(e.documentId);
    else if (e.action === "delete") r.deleted += 1;
    else r.restored += 1;
    seen(r, e.at);
  }
  for (const a of acks) {
    if (!a.ackBy || !a.ackAt || bangkokMonth(a.ackAt) !== month) continue;
    const r = row(a.ackBy);
    r.acked += 1;
    seen(r, a.ackAt);
  }
  return [...rows.values()]
    .map(({ editedIds, ...r }) => ({ ...r, edited: editedIds.size }))
    .sort((a, b) => b.created + b.edited + b.acked - (a.created + a.edited + a.acked) || b.lastAt.localeCompare(a.lastAt));
}
