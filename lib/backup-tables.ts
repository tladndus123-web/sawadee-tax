// What the weekly backup (scripts/backup.ts) saves and keeps: every table the migrations create, and the newest
// run folders. Pure, so it is tested (lib/backup-tables.test.ts).

/** One-time LINE link codes expire in minutes: not worth keeping */
const SKIP = new Set(["line_link_codes"]);

/** Every public table created by the migration files, sorted */
export function tablesOf(sqlFiles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const sql of sqlFiles) for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_][a-z0-9_]*)/gi)) out.add(m[1].toLowerCase());
  return [...out].filter((t) => !SKIP.has(t)).sort();
}

const RUN = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/;

/** Run folders (named by time, e.g. 2026-09-28-05-32) older than the newest `keep`; other folders are never touched */
export function runsToRemove(folders: readonly string[], keep: number): string[] {
  const runs = folders.filter((f) => RUN.test(f)).sort();
  return runs.slice(0, Math.max(0, runs.length - keep));
}
