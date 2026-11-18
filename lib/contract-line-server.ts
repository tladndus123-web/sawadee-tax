// Contracts on LINE, server side (service role; lib/contract-line has the words and rules). "계약서" from an active
// admin → contract mode for 10 minutes (line_modes 'contract', the same table as expense mode — starting one ends the
// other). In contract mode one photo or PDF → the file into documents/contracts/<new id>/…, the contract reader
// (lib/contract-read-server), a row in public.contracts as that admin → a card with what was saved. When the AI cannot
// read it the file is still saved (fill in the app); when it is plainly not a contract nothing is kept.

import { isFullAdmin } from "./full-admin-server";
import type { messagingApi } from "@line/bot-sdk";
import { contractFile, readContract } from "./contract-read-server";
import { askContract } from "./contract-ai-server";
import { cleanContractAi } from "./contract-ai";
import { CONTRACT_MODE_MINUTES, contractFileType, contractWords, savedCardText } from "./contract-line";
import { contractFilePath, MAX_FILE_BYTES } from "./contracts";
import { noticeMessage } from "./line-dash";
import type { LineLang } from "./line-lang";
import { profileLang } from "./line-menu";
import { supabaseAdmin } from "./supabase/admin";
import { todayBangkok } from "./thai-tax";

type Send = (messages: messagingApi.Message[]) => Promise<void>;
const text = (t: string): messagingApi.TextMessage => ({ type: "text", text: t });

async function lineAdmin(lineUser: string) {
  const { data } = await supabaseAdmin().from("members").select("user_id, role, disabled_at").eq("line_user_id", lineUser).maybeSingle();
  return data as { user_id: string; role: string; disabled_at: string | null } | null;
}

/** "계약서" typed: contract mode for the next minutes (active admins only) */
export async function startContractMode(lineUser: string, send: Send): Promise<void> {
  const lang = await profileLang(lineUser);
  const w = contractWords(lang);
  const m = await lineAdmin(lineUser);
  if (!m || m.disabled_at) return send([text(w.notMember)]);
  if (m.role !== "admin" || !(await isFullAdmin(supabaseAdmin(), m.user_id))) return send([text(w.adminOnly)]);
  const until = new Date(Date.now() + CONTRACT_MODE_MINUTES * 60_000).toISOString();
  const { error } = await supabaseAdmin().from("line_modes").upsert({ line_user_id: lineUser, mode: "contract", until });
  if (error) throw error;
  await send([text(w.modeOn)]);
}

export async function inContractMode(lineUser: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("line_modes").select("until").eq("line_user_id", lineUser).eq("mode", "contract").maybeSingle();
  return !!data && Date.parse(data.until as string) > Date.now();
}

/** Contract mode ends once its file is saved (the next photo is a receipt again) */
async function endContractMode(lineUser: string) {
  await supabaseAdmin().from("line_modes").delete().eq("line_user_id", lineUser).eq("mode", "contract");
}

/**
 * A photo / PDF sent in contract mode → a contract. The caller downloaded it and made sure its LINE event is new.
 * Returns the messages to answer with (never sends itself).
 */
export async function contractFromLine(lineUser: string, buf: Buffer, appUrl: string, lang: LineLang, signal?: AbortSignal, onSaved?: (id: string) => void): Promise<messagingApi.Message[]> {
  const w = contractWords(lang);
  const m = await lineAdmin(lineUser);
  if (!m || m.disabled_at) return [text(w.notMember)];
  if (m.role !== "admin" || !(await isFullAdmin(supabaseAdmin(), m.user_id))) return [text(w.adminOnly)];
  const kind = contractFileType(buf);
  if (!kind) return [text(w.notFile)];
  if (buf.length > MAX_FILE_BYTES) return [text(w.tooBig)];

  const admin = supabaseAdmin();
  const id = crypto.randomUUID();
  const path = contractFilePath(id, `line.${kind.ext}`);
  const up = await admin.storage.from("documents").upload(path, buf, { contentType: kind.type });
  if (up.error) throw up.error;

  const today = todayBangkok();
  const read = await readContract({ buf, type: kind.type }, lang, today, signal);
  if (!read.ok && read.code === "none") {
    await admin.storage.from("documents").remove([path]);
    return [text(w.notContract)];
  }
  const r = read.ok ? read.reading : null;
  const { error } = await admin.from("contracts").insert({
    id,
    title: r?.title || `${w.untitled} ${today}`,
    party: r?.party ?? "",
    kind: r?.kind ?? "other",
    start_on: r?.startOn ?? null,
    end_on: r?.endOn ?? null,
    auto_renew: r?.autoRenew ?? false,
    ...(r?.noticeDays ? { notice_days: r.noticeDays } : {}),
    amount: r?.amount ?? null,
    note: r?.note ?? "",
    file_path: path,
    file_name: `LINE ${today}.${kind.ext}`,
    file_type: kind.type,
    created_by: m.user_id,
  });
  if (error) {
    await admin.storage.from("documents").remove([path]);
    throw error;
  }
  await endContractMode(lineUser);
  console.log(`[line] contract saved${r ? "" : " (not read)"}`);
  onSaved?.(id);
  return [noticeMessage([savedCardText(r, `${appUrl}/contracts`, lang)], "CONTRACT", lang)];
}

/**
 * After the reply: the contract box's AI summary (main terms, notice date) made at once for a contract that came on
 * LINE, so it is there when the box is opened (owner 2026-11-18). Best effort: a failure leaves the "AI 요약" button.
 */
export async function summarizeLineContract(id: string, lang: LineLang): Promise<void> {
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("contracts").select("id, title, party, kind, start_on, end_on, auto_renew, notice_days, note, file_path, ai_summary").eq("id", id).maybeSingle();
  if (!row?.file_path || row.ai_summary || !process.env.ANTHROPIC_API_KEY) return;
  const file = await contractFile(admin, row.file_path as string);
  if (!file) return;
  const parsed = await askContract(file, row, lang, "");
  const summary = parsed ? cleanContractAi(parsed, row.file_path as string) : null;
  if (!summary) return;
  await admin.from("contracts").update({ ai_summary: summary }).eq("id", id);
  console.log("[line] contract summary kept");
}
