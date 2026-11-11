// Vercel's file tracer misses sharp's Linux binaries, so next.config.ts lists them per route
// (outputFileTracingIncludes). A route that reaches sharp but is not listed loads without it in production and
// quietly falls back (2026-11-11: receipt splitting sent long slips whole). This keeps the list complete.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
// Server modules whose routes read photos (sharp through loadSharp / photoHashServer; bot-server = Grok Bot's
// add_receipt). lib/line-bot is left out: most routes import it only to send messages; its webhook is listed below.
const SHARP_USERS = /from "@\/lib\/(extract-server|split-server|photo-hash-server|bot-docs-server|bot-server)"/;
const ALSO = ["/api/line/webhook"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("sharp's Linux binaries are traced for every route that uses it", () => {
  const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
  const users = routes(path.join(ROOT, "app/api"))
    .filter((f) => SHARP_USERS.test(readFileSync(f, "utf8")))
    .map((f) => "/" + path.relative(path.join(ROOT, "app"), path.dirname(f)).split(path.sep).join("/"))
    .concat(ALSO);

  it("finds the known ones", () => {
    expect(users).toEqual(expect.arrayContaining(["/api/extract", "/api/split", "/api/mcp", "/api/line/webhook"]));
  });

  it.each(users)("%s is in outputFileTracingIncludes with SHARP_LINUX", (route) => {
    const line = config.split("\n").find((l) => l.includes(`"${route}":`));
    expect(line, `${route} missing from next.config.ts outputFileTracingIncludes`).toBeDefined();
    expect(line).toContain("SHARP_LINUX");
  });
});
