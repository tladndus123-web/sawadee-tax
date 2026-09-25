// LINE Messaging API webhook. Checks LINE's signature, answers 200 at once (LINE times out and
// retries slow webhooks), then handles the events in the background with after(). What each event
// does is in lib/line-bot.ts.

import { validateSignature, type webhook } from "@line/bot-sdk";
import { after } from "next/server";
import { lineConfig } from "@/lib/line";
import { handleLineEvent, sayFailed } from "@/lib/line-bot";

export const runtime = "nodejs";
// An AI reading takes 20–60 seconds and after() runs inside this budget
export const maxDuration = 300;

export async function POST(req: Request) {
  const { channelSecret, channelAccessToken } = lineConfig();
  if (!channelSecret || !channelAccessToken) {
    console.error("[line] LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN are not set");
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!signature || !validateSignature(body, channelSecret, signature)) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  let events: webhook.Event[];
  try {
    events = (JSON.parse(body) as webhook.CallbackRequest).events ?? [];
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  // Kinds only (never message text): e.g. "message:image, follow"
  if (events.length) console.log(`[line] ${events.map((e) => (e.type === "message" ? `message:${e.message.type}` : e.type)).join(", ")}`);
  after(() =>
    Promise.all(
      events.map((event) =>
        handleLineEvent(event).catch(async (e) => {
          console.error("[line] event failed", e);
          await sayFailed(event);
        }),
      ),
    ),
  );
  return Response.json({ ok: true });
}
