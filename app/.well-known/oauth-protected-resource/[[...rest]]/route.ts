// Where an AI agent signs in to use /api/mcp (RFC 9728). Also answered under /.well-known/oauth-protected-resource/api/mcp.
import { resourceMetadata } from "@/lib/oauth";
import { originOf } from "@/lib/owner-server";

export const dynamic = "force-dynamic";
const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export function GET(req: Request) {
  return Response.json(resourceMetadata(originOf(req)), { headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "*" } });
}
