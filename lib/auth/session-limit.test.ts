import { describe, expect, it } from "vitest";
import { isSessionExpired, SESSION_HOURS, sessionEndsAt, signedInAt } from "./session-limit";

// Unsigned test token with the given payload (the functions never verify signatures)
const token = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString("base64url")}.s`;

// Same shape as a real local Supabase token (checked 2026-09-26): the amr timestamp stays, iat moves on refresh
const SIGN_IN = 1_790_369_372; // seconds
const fresh = token({ iat: SIGN_IN, amr: [{ method: "otp", timestamp: SIGN_IN }], session_id: "s1" });
const refreshed = token({ iat: SIGN_IN + 11 * 3600, amr: [{ method: "otp", timestamp: SIGN_IN }], session_id: "s1" });
const H = 3_600_000;

describe("session limit", () => {
  it("defaults to 12 hours", () => {
    expect(SESSION_HOURS).toBe(12);
  });

  it("reads the sign-in time from amr, not from iat", () => {
    expect(signedInAt(fresh)).toBe(SIGN_IN * 1000);
    expect(signedInAt(refreshed)).toBe(SIGN_IN * 1000);
    expect(sessionEndsAt(refreshed)).toBe(SIGN_IN * 1000 + 12 * H);
  });

  it("is valid until exactly 12 hours after sign-in, then expired", () => {
    const start = SIGN_IN * 1000;
    expect(isSessionExpired(refreshed, start)).toBe(false);
    expect(isSessionExpired(refreshed, start + 11 * H + 59 * 60_000)).toBe(false);
    expect(isSessionExpired(refreshed, start + 12 * H - 1)).toBe(false);
    expect(isSessionExpired(refreshed, start + 12 * H)).toBe(true);
    expect(isSessionExpired(refreshed, start + 30 * H)).toBe(true);
  });

  it("a token refresh does not extend the limit", () => {
    const later = token({ iat: SIGN_IN + 13 * 3600, amr: [{ method: "otp", timestamp: SIGN_IN }] });
    expect(isSessionExpired(later, (SIGN_IN + 13 * 3600) * 1000)).toBe(true);
  });

  it("uses the earliest entry when there are several", () => {
    const mfa = token({ amr: [{ method: "totp", timestamp: SIGN_IN + 600 }, { method: "otp", timestamp: SIGN_IN }] });
    expect(signedInAt(mfa)).toBe(SIGN_IN * 1000);
  });

  it("takes another limit", () => {
    expect(isSessionExpired(fresh, SIGN_IN * 1000 + 2 * H, 1)).toBe(true);
    expect(isSessionExpired(fresh, SIGN_IN * 1000 + 2 * H, 24)).toBe(false);
  });

  it("never expires a token it cannot read (Supabase still checks it)", () => {
    for (const bad of ["", "not-a-jwt", "a.%%%.c", token({}), token({ amr: [] }), token({ amr: [{ method: "otp" }] }), token({ amr: "x" })]) {
      expect(signedInAt(bad)).toBeNull();
      expect(isSessionExpired(bad, Date.now())).toBe(false);
    }
  });

  it("decodes non-ASCII payloads", () => {
    const t = token({ amr: [{ method: "otp", timestamp: SIGN_IN }], user_metadata: { name: "ทดสอบ 日本語 한국어" } });
    expect(signedInAt(t)).toBe(SIGN_IN * 1000);
  });
});
