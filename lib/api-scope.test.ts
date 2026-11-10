// Guard (final check 2026-11-10): an API route that reads the books with the service role for a signed-in admin must
// narrow it to what that admin may see — `scopedAdmin` (kept-out branches), `isFullAdmin` / `adminCaller` (company-wide
// numbers) or an owner check. /api/payroll/slips once sent every branch's payslips for an admin kept out of a branch,
// and the two "send a test" routes sent company totals to limited admins.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p.replaceAll("\\", "/")] : [];
  });

// Service-role routes with no signed-in admin to scope for, and why
const OTHER_GUARD: Record<string, string> = {
  "app/api/bot-events/route.ts": "any member, for a document the session can read (checked through RLS first)",
  "app/api/calendar/feed/route.ts": "secret feed token",
  "app/api/mcp/route.ts": "bot key made by an owner (sha-256 looked up), whole company by design",
  "app/api/oauth/authorize/route.ts": "public, registered redirect only; the owner decides on the consent page",
  "app/api/share/[token]/photos/route.ts": "accountant share token",
  "app/api/oauth/register/route.ts": "public client registration, no books",
  "app/api/oauth/token/route.ts": "one-time code + PKCE",
  "app/api/share/[token]/photo/[id]/route.ts": "accountant share token",
  "app/api/share/[token]/xlsx/route.ts": "accountant share token",
};

describe("service-role API routes", () => {
  const files = routes("app/api").filter((f) => readFileSync(f, "utf8").includes("supabaseAdmin("));
  it("finds them", () => expect(files.length).toBeGreaterThan(15));
  it.each(files)("%s narrows what the caller gets", (f) => {
    const src = readFileSync(f, "utf8");
    if (OTHER_GUARD[f]) return;
    const guards = ["scopedAdmin(", "isFullAdmin(", "adminCaller(", ".owner", "CRON_SECRET", "x-line-signature", "validateSignature", "ownerCaller(", "owner-server"];
    expect(guards.some((g) => src.includes(g)), `${f} uses the service role without scoping it to the caller`).toBe(true);
  });
  it("payslips and the test reminders are scoped", () => {
    expect(readFileSync("app/api/payroll/slips/route.ts", "utf8")).toContain("scopedAdmin(service, await hiddenBranches(service, user.id))");
    for (const f of ["app/api/line/test-reminder/route.ts", "app/api/push/test/route.ts"]) expect(readFileSync(f, "utf8")).toContain("isFullAdmin(admin, user.id)");
  });
});
