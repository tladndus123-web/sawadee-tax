// Server steps that read with the service role on behalf of one admin (LINE answers, claim notices) leave out the
// branches an owner kept that admin out of (supabase …003200_owners.sql) — the database does the same for the app.
// Server only.

import type { supabaseAdmin } from "./supabase/admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** Tables whose rows belong to a branch (column), as the app's policies see them */
const BY_BRANCH: Record<string, string> = {
  documents: "branch_id",
  sales: "branch_id",
  branch_targets: "branch_id",
  cash_moves: "branch_id",
  expense_claims: "branch_id",
  fixed_costs: "branch_id",
  labor_costs: "branch_id",
  payroll_lines: "branch_id",
  employees: "branch_id",
  stock_counts: "branch_id",
  stock_items: "branch_id",
  branches: "id",
};

/** The branches this member is kept out of (none for owners) */
export async function hiddenBranches(admin: Admin, userId: string): Promise<string[]> {
  const [{ data: m }, { data: k }] = await Promise.all([
    admin.from("members").select("owner").eq("user_id", userId).maybeSingle(),
    admin.from("member_branch_blocks").select("branch_id").eq("user_id", userId),
  ]);
  if (m?.owner) return [];
  return (k ?? []).map((r) => r.branch_id as string);
}

/** The PostgREST filter that keeps rows without a branch and rows of the other branches */
export const notIn = (col: string, hidden: readonly string[]) => `${col}.is.null,${col}.not.in.(${hidden.join(",")})`;

/** The service-role client, but every select on a branch table leaves out `hidden` */
export function scopedAdmin(admin: Admin, hidden: readonly string[]): Admin {
  if (!hidden.length) return admin;
  return new Proxy(admin, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const q = target.from(table);
        const col = BY_BRANCH[table];
        if (!col) return q;
        return new Proxy(q, {
          get(t, p, r) {
            if (p !== "select") return Reflect.get(t, p, r);
            return (...args: Parameters<typeof t.select>) => t.select(...args).or(notIn(col, hidden));
          },
        });
      };
    },
  }) as Admin;
}
