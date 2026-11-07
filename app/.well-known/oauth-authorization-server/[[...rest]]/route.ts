// How an AI agent signs in here (RFC 8414): register, authorize (the owner's "허용"), token. PKCE S256 only.
import { serverMetadata } from "@/lib/oauth";
import { originOf } from "@/lib/owner-server";

export const dynamic = "force-dynamic";
const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export function GET(req: Request) {
  return Response.json(serverMetadata(originOf(req)), { headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "*" } });
}
