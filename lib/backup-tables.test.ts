import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runsToRemove, tablesOf } from "./backup-tables";

describe("backup: which tables", () => {
  it("every table a migration creates, once, without the one-time LINE codes", () => {
    const t = tablesOf(["create table public.sales (\n", "CREATE TABLE IF NOT EXISTS public.fixed_costs (", "create table public.line_link_codes (", "create table public.sales ("]);
    expect(t).toEqual(["fixed_costs", "sales"]);
  });
  it("the real migrations: the books, payroll and the newer tables are all in", () => {
    const dir = "supabase/migrations";
    const t = tablesOf(readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(dir, f), "utf8")));
    for (const must of ["documents", "document_items", "vendors", "sales", "employees", "payroll_lines", "attendance", "fixed_costs", "labor_costs", "branches", "categories", "company_settings", "members"]) {
      expect(t).toContain(must);
    }
    expect(t).not.toContain("line_link_codes");
  });
});

describe("backup: which old runs to remove", () => {
  it("keeps the newest runs; never touches photos or other folders", () => {
    const folders = ["photos", "2026-09-26-05-54", "2026-09-28-05-32", "2026-09-28-07-30", "notes", "2026-10-05-03-00"];
    expect(runsToRemove(folders, 2)).toEqual(["2026-09-26-05-54", "2026-09-28-05-32"]);
    expect(runsToRemove(folders, 12)).toEqual([]);
  });
});
