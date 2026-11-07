import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newClientId, newCode, pkceOk, readAuthRequest, redirectOk, serverMetadata, withParams } from "./oauth";

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("agent sign-in (OAuth with PKCE)", () => {
  it("checks the PKCE verifier against the challenge", () => {
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); // the RFC 7636 example
    expect(pkceOk(verifier, challenge)).toBe(true);
    expect(pkceOk(verifier + "x", challenge)).toBe(false);
    expect(pkceOk("short", challenge)).toBe(false);
  });
  it("sends codes back only to https, a loopback address or an app's own scheme", () => {
    for (const ok of ["https://cursor.com/grok-bot/link/v1/oauth", "http://127.0.0.1:8765/callback", "http://localhost:3000/cb", "grokbot://app/v1/oauth-callback", "cursor://anysphere.cursor-retrieval/oauth"]) expect(redirectOk(ok)).toBe(true);
    for (const bad of ["http://evil.com/cb", "javascript:alert(1)", "data:text/html,x", "file:///c:/x", "https://x.com/#frag", "not a url"]) expect(redirectOk(bad)).toBe(false);
  });
  it("reads an authorize request and refuses a broken one", () => {
    const q = new URLSearchParams({ response_type: "code", client_id: newClientId(), redirect_uri: "grokbot://app/cb", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" });
    expect(readAuthRequest(q)).toMatchObject({ redirectUri: "grokbot://app/cb", challenge, state: "xyz" });
    expect(readAuthRequest(new URLSearchParams({ ...Object.fromEntries(q), code_challenge_method: "plain" }))).toEqual({ error: "invalid_request" });
    expect(readAuthRequest(new URLSearchParams({ ...Object.fromEntries(q), response_type: "token" }))).toEqual({ error: "unsupported_response_type" });
    expect(readAuthRequest(new URLSearchParams({ ...Object.fromEntries(q), client_id: "x" }))).toEqual({ error: "invalid_client" });
  });
  it("adds the code and state to the way back", () => {
    expect(withParams("grokbot://app/cb?x=1", { code: "abc", state: "s", error: undefined })).toBe("grokbot://app/cb?x=1&code=abc&state=s");
  });
  it("makes ids and codes of the right shape and tells where to sign in", () => {
    expect(newClientId()).toMatch(/^mcp_[A-Za-z0-9]{24}$/);
    expect(newCode()).toHaveLength(43);
    expect(serverMetadata("https://a.b")).toMatchObject({ authorization_endpoint: "https://a.b/api/oauth/authorize", code_challenge_methods_supported: ["S256"] });
  });
});
