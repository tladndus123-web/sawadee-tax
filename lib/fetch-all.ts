// Every row, not just the first 1000 (owner 2026-11-09: "서류가 1000장 넘어도 문제가 없는지"). The database answers at most
// `max_rows` (1000) rows per request and silently drops the rest, so a list read in one go — the ledger, sales, claims —
// would lose its oldest rows once there are more. This asks page by page (500 a time, safely under the cap) until a page
// comes back short. Works for the browser and the server client alike.
//
// `make` must build a fresh query each time (a query can only be sent once) and the rows need a stable order: pass
// `key`, a unique column (default "id"), and it is added as the last sort so pages never overlap or skip.

export const PAGE = 500;

interface Page<T> {
  data: T[] | null;
  error: unknown;
}
interface Ranged<T> extends PromiseLike<Page<T>> {
  range(from: number, to: number): PromiseLike<Page<T>>;
  order(column: string, opts?: { ascending?: boolean }): Ranged<T>;
}

export async function fetchAll<T>(make: () => unknown, key: string | null = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = make() as Ranged<T>;
    if (key) q = q.order(key, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Same, for the places that read `{ data, error }`: never throws, hands back the error instead */
export async function allRows<T>(make: () => unknown, key: string | null = "id"): Promise<Page<T>> {
  try {
    return { data: await fetchAll<T>(make, key), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
