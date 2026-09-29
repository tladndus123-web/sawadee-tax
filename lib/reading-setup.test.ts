import { afterEach, describe, expect, it, vi } from "vitest";
import { BULK_FROM, readingFor } from "./extract-server";

afterEach(() => vi.unstubAllEnvs());

describe("which model reads a photo (owner's choice 2026-09-30)", () => {
  it("a photo of its own, or 2 receipts on one photo: Sonnet 5.5 at medium", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    vi.stubEnv("ANTHROPIC_EFFORT", "");
    for (const n of [0, 1, 2]) expect(readingFor(n)).toEqual({ model: "claude-sonnet-5-5", effort: "medium" });
  });
  it("3 or more receipts on one photo: Opus 5.5 at low", () => {
    vi.stubEnv("ANTHROPIC_BULK_MODEL", "");
    vi.stubEnv("ANTHROPIC_BULK_EFFORT", "");
    expect(BULK_FROM).toBe(3);
    for (const n of [3, 10]) expect(readingFor(n)).toEqual({ model: "claude-opus-5-5", effort: "low" });
  });
  it("the Vercel settings can change either", () => {
    vi.stubEnv("ANTHROPIC_BULK_MODEL", "claude-opus-5-5");
    vi.stubEnv("ANTHROPIC_BULK_EFFORT", "medium");
    expect(readingFor(5).effort).toBe("medium");
  });
});
