// The sign-in that connects an AI agent (Grok Bot) without copying a key (owner, 2026-11-08): OAuth 2.1 the way MCP
// clients expect it — they find us from the 401 of /api/mcp (WWW-Authenticate → resource metadata), register
// themselves, send the owner to our "허용" page with a PKCE challenge, and swap the one-time code for a key.
// Pure rules here; routes in app/api/oauth/* and app/.well-known/*.

import { createHash, randomBytes } from "node:crypto";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const randomText = (n: number): string => {
  let s = "";
  for (const b of randomBytes(n)) s += ABC[b % ABC.length];
  return s;
};
export const newClientId = () => `mcp_${randomText(24)}`;
export const newCode = () => randomText(43);
export const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** PKCE S256: base64url(sha256(verifier)) === challenge; the verifier is 43–128 of A–Z a–z 0–9 - . _ ~ */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier, "ascii").digest("base64url") === challenge;
}

/**
 * Where an agent may get its code back: https, a loopback address (a desktop app listening), or its own app scheme
 * (grokbot://, cursor://). Never a page script, data or a file.
 */
export function redirectOk(uri: string): boolean {
  if (uri.length > 500) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]{2,30}:$/.test(u.protocol) && !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:"].includes(u.protocol);
}

/** The redirect back to the agent with the code (or an error) and its state */
export function withParams(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, v);
  return u.toString();
}

/** What the agent asks for on /api/oauth/authorize, checked (the client is checked against the database after) */
export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}

export function readAuthRequest(q: URLSearchParams): AuthRequest | { error: string } {
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const challenge = q.get("code_challenge") ?? "";
  if (q.get("response_type") !== "code") return { error: "unsupported_response_type" };
  if (!/^mcp_[A-Za-z0-9]{24}$/.test(clientId)) return { error: "invalid_client" };
  if (!redirectOk(redirectUri)) return { error: "invalid_request" };
  if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return { error: "invalid_request" };
  const state = (q.get("state") ?? "").slice(0, 500);
  return { clientId, redirectUri, challenge, state };
}

/** The name to show for an agent: Grok Bot is built on Cursor and registers as "Cursor" (seen on the live site 2026-11-08) */
export const agentName = (name: string): string => (/^cursor$/i.test(name.trim()) ? "Grok Bot" : name.trim() || "AI agent");

/** The metadata that tells an agent where to sign in (RFC 9728 resource + RFC 8414 server) */
export function resourceMetadata(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Sawadee TAX" };
}
export function serverMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["books"],
  };
}
