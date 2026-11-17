// The waste log on LINE, server side (lib/waste-line has the words and the line reader): "폐기" starts waste mode for a
// linked member while the restaurant extra is on; a photo in waste mode is kept for the next line; a line then becomes a
// waste record of the member's home branch (or the head branch), source "line". Service role: every check the database
// would make for the app (member, branch not kept out) is made here first.

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
  const { data } = await supabaseAdmin().from("members").select("user_id, home_branch").eq("line_user_id", lineUser).is("disabled_at", null).maybeSingle();
  return data as { user_id: string; home_branch: string | null } | null;
}

async function wasteOn(): Promise<boolean> {
  const { data } = await supabaseAdmin().from("company_settings").select("extras").eq("id", 1).maybeSingle();
  return readFoodFeatures(data?.extras).waste;
}

/** "폐기" typed: waste mode for the next minutes (linked members, only while the extra is on) */
export async function startWasteMode(lineUser: string, send: Send): Promise<void> {
  const w = WASTE_LINE_TEXT[await langOf(lineUser)];
  if (!(await wasteOn())) return send([{ type: "text", text: w.off }]);
  if (!(await member(lineUser))) return send([{ type: "text", text: w.notMember }]);
  const until = new Date(Date.now() + MODE_MINUTES * 60_000).toISOString();
  const { error } = await supabaseAdmin().from("line_modes").upsert({ line_user_id: lineUser, mode: "waste", until, photo_path: null });
  if (error) throw error;
  await send([{ type: "text", text: w.modeOn }]);
}

export async function inWasteMode(lineUser: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("line_modes").select("until").eq("line_user_id", lineUser).eq("mode", "waste").maybeSingle();
  return !!data && Date.parse(data.until as string) > Date.now();
}

/** A photo in waste mode: kept under waste/<new id>/ until the next line (the mode runs another 10 minutes) */
export async function keepWastePhoto(lineUser: string, photo: Buffer, type: string, send: Send): Promise<void> {
  const w = WASTE_LINE_TEXT[await langOf(lineUser)];
  const path = `waste/${crypto.randomUUID()}/line.${type === "image/png" ? "png" : "jpg"}`;
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, photo, { contentType: type || "image/jpeg" });
  if (error) throw error;
  const until = new Date(Date.now() + MODE_MINUTES * 60_000).toISOString();
  await supabaseAdmin().from("line_modes").update({ photo_path: path, until }).eq("line_user_id", lineUser).eq("mode", "waste");
  await send([{ type: "text", text: w.photoKept }]);
}

/** A line in waste mode → a waste record (with the kept photo); false when the line does not read as one */
export async function wasteFromLine(lineUser: string, text: string, send: Send): Promise<boolean> {
  const lang = await langOf(lineUser);
  const w = WASTE_LINE_TEXT[lang];
  const line = readWasteLine(text);
  if (!line) {
    await send([{ type: "text", text: w.unclear }]);
    return false;
  }
  const m = await member(lineUser);
  if (!m || !(await wasteOn())) {
    await send([{ type: "text", text: m ? w.off : w.notMember }]);
    return false;
  }
  const admin = supabaseAdmin();
  // The member's home branch, else the head branch — never one they are kept out of
  const { data: head } = await admin.from("branches").select("id").eq("no", "00000").maybeSingle();
  const branch = m.home_branch ?? (head?.id as string | undefined) ?? null;
  if (branch) {
    const { data: kept } = await admin.from("member_branch_blocks").select("branch_id").eq("user_id", m.user_id).eq("branch_id", branch).maybeSingle();
    if (kept) {
      await send([{ type: "text", text: w.notMember }]);
      return false;
    }
  }
  const { data: mode } = await admin.from("line_modes").select("photo_path").eq("line_user_id", lineUser).eq("mode", "waste").maybeSingle();
  const photo = (mode?.photo_path as string | null) ?? null;
  const { error } = await admin.from("waste_logs").insert({
    ...(branch ? { branch_id: branch } : {}),
    day: todayBangkok(),
    item: line.item,
    qty: line.qty,
    unit: line.unit,
    amount: line.amount,
    reason: line.reason,
    photo_path: photo,
    source: "line",
    created_by: m.user_id,
  });
  if (error) throw error;
  // The photo is used; the mode runs on for the next line
  await admin.from("line_modes").update({ photo_path: null, until: new Date(Date.now() + MODE_MINUTES * 60_000).toISOString() }).eq("line_user_id", lineUser).eq("mode", "waste");
  const amount = line.amount === null ? "" : `฿${line.amount.toLocaleString("en-US")}`;
  await send([{ type: "text", text: `${w.saved({ item: line.item, qty: line.qty, unit: line.unit, amount })}\n${w.open}: ${appUrl()}/${lang}/waste` }]);
  return true;
}
