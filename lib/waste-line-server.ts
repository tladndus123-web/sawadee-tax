// The waste log on LINE, server side (lib/waste-line has the words and the line reader): "폐기" starts waste mode for a
// linked member while the restaurant extra is on; a photo in waste mode is kept for the next line; a line that reads as
// waste becomes a record in a branch the member may use (the caller passes it — lib/line-bot usableBranches, the same
// rule as receipts), source "line", and the mode ends. Anything else typed in waste mode goes on to the usual chat;
// "끝" / "end" leaves the mode. Service role: the member / branch / feature checks are made here and by the caller.

import crypto from "node:crypto";
import type { messagingApi } from "@line/bot-sdk";
import { appUrl } from "./app-url";
import { readFoodFeatures } from "./food-features";
import { lineLang } from "./line-lang";
import { profileLang } from "./line-menu";
import { supabaseAdmin } from "./supabase/admin";
import { todayBangkok } from "./thai-tax";
import { readWasteLine, WASTE_LINE_TEXT, type WasteLang } from "./waste-line";

type Send = (messages: messagingApi.Message[]) => Promise<void>;
const MODE_MINUTES = 10;
const BUCKET = "documents";

const langOf = async (lineUser: string): Promise<WasteLang> => lineLang(await profileLang(lineUser)) as WasteLang;

async function member(lineUser: string) {
  const { data } = await supabaseAdmin().from("members").select("user_id").eq("line_user_id", lineUser).is("disabled_at", null).maybeSingle();
  return data as { user_id: string } | null;
}

async function wasteOn(): Promise<boolean> {
  const { data } = await supabaseAdmin().from("company_settings").select("extras").eq("id", 1).maybeSingle();
  return readFoodFeatures(data?.extras).waste;
}

async function modeRow(lineUser: string) {
  const { data } = await supabaseAdmin().from("line_modes").select("until, photo_path").eq("line_user_id", lineUser).eq("mode", "waste").maybeSingle();
  return data as { until: string; photo_path: string | null } | null;
}

/** "폐기" typed: waste mode for the next minutes (linked members, only while the extra is on) */
export async function startWasteMode(lineUser: string, send: Send): Promise<void> {
  const w = WASTE_LINE_TEXT[await langOf(lineUser)];
  if (!(await wasteOn())) return send([{ type: "text", text: w.off }]);
  if (!(await member(lineUser))) return send([{ type: "text", text: w.notMember }]);
  await dropPhoto(lineUser);
  const until = new Date(Date.now() + MODE_MINUTES * 60_000).toISOString();
  const { error } = await supabaseAdmin().from("line_modes").upsert({ line_user_id: lineUser, mode: "waste", until, photo_path: null });
  if (error) throw error;
  await send([{ type: "text", text: w.modeOn }]);
}

export async function inWasteMode(lineUser: string): Promise<boolean> {
  const m = await modeRow(lineUser);
  return !!m && Date.parse(m.until) > Date.now();
}

/** The photo waiting in the mode, removed (a new one replaces it, or the mode ends without a record) */
async function dropPhoto(lineUser: string) {
  const m = await modeRow(lineUser);
  if (m?.photo_path) await supabaseAdmin().storage.from(BUCKET).remove([m.photo_path]).catch(() => undefined);
}

/** "끝" / "end" in waste mode, or the end after a record */
export async function endWasteMode(lineUser: string, send?: Send, keepPhoto = false): Promise<void> {
  if (!keepPhoto) await dropPhoto(lineUser);
  await supabaseAdmin().from("line_modes").delete().eq("line_user_id", lineUser).eq("mode", "waste");
  if (send) await send([{ type: "text", text: WASTE_LINE_TEXT[await langOf(lineUser)].ended }]);
}

/** A photo in waste mode: kept under waste/<new id>/ until the next line (an earlier waiting photo is removed) */
export async function keepWastePhoto(lineUser: string, photo: Buffer, type: string, send: Send): Promise<void> {
  const w = WASTE_LINE_TEXT[await langOf(lineUser)];
  if (!(await wasteOn())) return endWasteMode(lineUser, () => send([{ type: "text", text: w.off }]));
  await dropPhoto(lineUser);
  const path = `waste/${crypto.randomUUID()}/line.${type === "image/png" ? "png" : "jpg"}`;
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, photo, { contentType: type || "image/jpeg" });
  if (error) throw error;
  const until = new Date(Date.now() + MODE_MINUTES * 60_000).toISOString();
  await supabaseAdmin().from("line_modes").update({ photo_path: path, until }).eq("line_user_id", lineUser).eq("mode", "waste");
  await send([{ type: "text", text: w.photoKept }]);
}

/**
 * A line in waste mode that reads as waste (the caller checked readWasteLine) → a record in `branchId` by `userId` (the
 * caller checked the member and the branch, and that this LINE event is new). The mode ends with it.
 */
export async function wasteFromLine(lineUser: string, text: string, userId: string, branchId: string | null, send: Send): Promise<void> {
  const lang = await langOf(lineUser);
  const w = WASTE_LINE_TEXT[lang];
  const line = readWasteLine(text);
  if (!line) return send([{ type: "text", text: w.unclear }]);
  if (!(await wasteOn())) return endWasteMode(lineUser, () => send([{ type: "text", text: w.off }]));
  if (!branchId) return send([{ type: "text", text: w.notMember }]);
  const admin = supabaseAdmin();
  const photo = (await modeRow(lineUser))?.photo_path ?? null;
  const { error } = await admin.from("waste_logs").insert({
    branch_id: branchId,
    day: todayBangkok(),
    item: line.item,
    qty: line.qty,
    unit: line.unit.slice(0, 20),
    amount: line.amount,
    reason: line.reason,
    photo_path: photo,
    source: "line",
    created_by: userId,
  });
  if (error) {
    console.error("[waste] LINE record refused", error.message);
    return send([{ type: "text", text: w.unclear }]);
  }
  // The photo now belongs to the record; the mode ends ("폐기" again for the next one)
  await endWasteMode(lineUser, undefined, true);
  const amount = line.amount === null ? "" : `฿${line.amount.toLocaleString("en-US")}`;
  await send([{ type: "text", text: `${w.saved({ item: line.item, qty: line.qty, unit: line.unit, amount })}\n${w.open}: ${appUrl()}/${lang}/waste` }]);
}
