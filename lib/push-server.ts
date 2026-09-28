// Server only: phone notifications (web push) to the devices members turned them on for (public.push_subscriptions).
// Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (Vercel env). A device that has gone away
// (the browser answers 404 / 410) is removed.

import webpush from "web-push";
import type { supabaseAdmin } from "./supabase/admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap opens the app */
  url: string;
}

export const pushConfigured = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** A LINE reminder text as a notification: first line = title, the next two = body */
export function toPush(text: string, url: string): PushMessage {
  const lines = text.split("\n").filter((l) => l.trim() && !/^https?:\/\//.test(l.trim()));
  return { title: lines[0] ?? "Sawadee TAX", body: lines.slice(1, 3).join("\n"), url };
}

/** Send to every device of these members. Returns how many devices got it. */
export async function sendPush(admin: Admin, userIds: string[], messages: PushMessage[]): Promise<number> {
  if (!pushConfigured() || !userIds.length || !messages.length) return 0;
  setup();
  const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
  if (error) throw error;
  let sent = 0;
  await Promise.all(
    (data ?? []).map(async (s) => {
      for (const [i, m] of messages.entries()) {
        try {
          // Different tags so the payment and VAT notices both stay on screen
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...m, tag: `trl-${i}` }), { TTL: 86_400 });
          if (i === 0) sent += 1;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
            return;
          }
          console.error("[push] send failed", code ?? e);
        }
      }
    }),
  );
  return sent;
}
