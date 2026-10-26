// Expense claims on LINE (owner, 2026-10-28: "사장님은 LINE에서 승인"; ported 2026-10-27): the bot's words in the four
// languages, the warnings worded like the app's, the word that starts expense mode and the approve / reject buttons'
// postback. The card itself is drawn with the other dashboard cards (lib/line-dash claimCard); the sending is
// lib/expense-line-server.

import type { Flag } from "./expense-checks";
import type { LineLang } from "./line-lang";
import { bahtWhole } from "./money";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";

const FLAG_WORDS = { ja: ja.expenses.flag, th: th.expenses.flag, en: en.expenses.flag, ko: ko.expenses.flag } as const;

export const fillIn = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** The admin's warnings (lib/expense-checks), worded like the app's */
export function flagTexts(flags: Flag[], lang: LineLang): string[] {
  const w = FLAG_WORDS[lang] as Record<string, string>;
  return flags.map((f) => fillIn(w[f.kind] ?? f.kind, { amount: bahtWhole((f.n ?? 0) / 100), n: String(f.n ?? 0), word: f.word ?? "" }));
}

type Words = Record<
  | "head" | "who" | "what" | "note" | "month" | "approve" | "reject" | "photo" | "open" | "approved" | "rejected" | "already"
  | "adminOnly" | "toStaffOk" | "toStaffNo" | "toStaffPaid" | "modeOn" | "sent" | "sentAuto" | "dup" | "unreadable" | "notMember",
  string
>;

const W: Record<LineLang, Words> = {
  ko: { head: "🧾 경비 청구가 왔어요", who: "청구한 사람", what: "용도", note: "메모", month: "이번 달 이 사람 경비", approve: "✓ 승인", reject: "반려", photo: "영수증 사진", open: "앱에서 보기", approved: "승인했어요. {name} 님에게 알렸어요.", rejected: "반려했어요. 이유는 앱에서 적을 수 있어요.", already: "이미 처리된 청구예요.", adminOnly: "관리자만 승인할 수 있어요.", toStaffOk: "✓ 경비 {amount} 청구가 승인됐어요.", toStaffNo: "경비 {amount} 청구가 반려됐어요.", toStaffPaid: "경비 {amount}을(를) 돌려받았어요.", modeOn: "🧾 경비 청구 모드예요. 10분 안에 영수증 사진을 보내 주세요 (여러 장 OK).", sent: "✓ 경비를 청구했어요: {amount} · {seller}\n승인되면 알려 드릴게요.", sentAuto: "✓ 경비를 청구했어요: {amount} · {seller}\n금액이 작아서 바로 승인됐어요.", dup: "이 영수증은 이미 청구했거나 장부에 있어요.", unreadable: "영수증을 읽지 못했어요. 밝은 곳에서 전체가 보이게 다시 찍어 주세요.", notMember: "경비 청구는 앱 계정이 있는 사람만 할 수 있어요. 앱의 설정에서 LINE을 연결해 주세요." },
  ja: { head: "🧾 経費の申請が届きました", who: "申請者", what: "用途", note: "メモ", month: "今月のこの人の経費", approve: "✓ 承認", reject: "却下", photo: "領収書の写真", open: "アプリで見る", approved: "承認しました。{name} さんに知らせました。", rejected: "却下しました。理由はアプリで書けます。", already: "この申請はもう処理済みです。", adminOnly: "承認できるのは管理者だけです。", toStaffOk: "✓ 経費 {amount} の申請が承認されました。", toStaffNo: "経費 {amount} の申請は却下されました。", toStaffPaid: "経費 {amount} が精算されました。", modeOn: "🧾 経費申請モードです。10分以内に領収書の写真を送ってください（複数枚OK）。", sent: "✓ 経費を申請しました：{amount} · {seller}\n承認されたらお知らせします。", sentAuto: "✓ 経費を申請しました：{amount} · {seller}\n少額なのですぐ承認されました。", dup: "この領収書はすでに申請済みか、台帳にあります。", unreadable: "領収書を読めませんでした。明るい場所で全体が写るように撮り直してください。", notMember: "経費の申請はアプリのアカウントがある人だけです。アプリの設定で LINE を連携してください。" },
  th: { head: "🧾 มีคำขอเบิกค่าใช้จ่าย", who: "ผู้ขอเบิก", what: "ใช้สำหรับ", note: "หมายเหตุ", month: "ยอดเบิกเดือนนี้ของคนนี้", approve: "✓ อนุมัติ", reject: "ไม่อนุมัติ", photo: "รูปใบเสร็จ", open: "ดูในแอป", approved: "อนุมัติแล้ว แจ้ง {name} แล้ว", rejected: "ไม่อนุมัติแล้ว ใส่เหตุผลได้ในแอป", already: "คำขอนี้ดำเนินการไปแล้ว", adminOnly: "เฉพาะผู้ดูแลเท่านั้นที่อนุมัติได้", toStaffOk: "✓ คำขอเบิก {amount} ได้รับอนุมัติแล้ว", toStaffNo: "คำขอเบิก {amount} ไม่ได้รับอนุมัติ", toStaffPaid: "ได้รับเงินเบิก {amount} คืนแล้ว", modeOn: "🧾 โหมดเบิกค่าใช้จ่าย ส่งรูปใบเสร็จภายใน 10 นาที (หลายรูปได้)", sent: "✓ ส่งคำขอเบิกแล้ว: {amount} · {seller}\nจะแจ้งเมื่ออนุมัติ", sentAuto: "✓ ส่งคำขอเบิกแล้ว: {amount} · {seller}\nยอดน้อยจึงอนุมัติทันที", dup: "ใบเสร็จนี้เบิกไปแล้วหรือมีในสมุดบัญชีแล้ว", unreadable: "อ่านใบเสร็จไม่ได้ กรุณาถ่ายใหม่ในที่สว่างให้เห็นทั้งใบ", notMember: "เบิกค่าใช้จ่ายได้เฉพาะผู้ที่มีบัญชีในแอป กรุณาเชื่อม LINE ในหน้าตั้งค่าของแอป" },
  en: { head: "🧾 New expense claim", who: "Claimed by", what: "For", note: "Note", month: "Their claims this month", approve: "✓ Approve", reject: "Reject", photo: "Receipt photo", open: "Open in the app", approved: "Approved. {name} has been told.", rejected: "Rejected. You can add the reason in the app.", already: "This claim was already handled.", adminOnly: "Only admins can approve.", toStaffOk: "✓ Your expense claim of {amount} was approved.", toStaffNo: "Your expense claim of {amount} was rejected.", toStaffPaid: "Your expense claim of {amount} was paid back.", modeOn: "🧾 Expense claim mode. Send the receipt photos within 10 minutes (several are fine).", sent: "✓ Claimed: {amount} · {seller}\nYou'll hear when it's approved.", sentAuto: "✓ Claimed: {amount} · {seller}\nSmall enough to be approved right away.", dup: "This receipt was already claimed or is in the ledger.", unreadable: "The receipt couldn't be read. Take it again in good light with the whole receipt in view.", notMember: "Only people with an app account can claim expenses. Link LINE in the app's settings." },
};

export const expenseWords = (lang: LineLang) => W[lang];

/** "경비", "เบิก", "経費", "expense" … typed to the bot: start expense mode */
export const isExpenseWord = (t: string) => /^\s*(경비|경비\s*청구|เบิก|เบิกเงิน|เบิกค่าใช้จ่าย|経費|経費精算|立替|expense|expenses|claim)\s*$/i.test(t);

/** A postback of ours: what to do with which claim, or null */
export function expensePostback(data: string): { action: "approve" | "reject"; id: string } | null {
  const p = new URLSearchParams(data);
  const action = p.get("expense");
  const id = p.get("id") ?? "";
  if ((action !== "approve" && action !== "reject") || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { action, id };
}
