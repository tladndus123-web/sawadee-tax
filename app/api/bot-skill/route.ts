// The SKILL.md for Grok Bot as a public text file (no secrets in it: tool names and rules only), so the agent can fetch
// and save it as a skill by itself when the owner taps "스킬 만들기" (components/settings/BotCard).
import { skillMarkdown } from "@/lib/bot-skill";
import { originOf } from "@/lib/owner-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return new Response(skillMarkdown(originOf(req)), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
