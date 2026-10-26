// LINE bot pieces with no database access: API clients, the bot's words and the receipt card.
// Since 2026-10-26 the bot speaks each reader's own language (their phone's LINE language, lib/line-lang.ts): every
// text carries Thai · Japanese · Korean · English joined by LANG_SPLIT, and the sender keeps the reader's part.

import { messagingApi } from "@line/bot-sdk";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";
import type { CheckResult } from "./checks";
import { baht } from "./money";
import { dmy } from "./thai-tax";
import { four, inLang, LANG_SPLIT, type LineLang, type Words } from "./line-lang";
import type { LedgerDoc } from "./types";

// Keys never contain whitespace; a line break or space pasted into .env makes LINE refuse some calls
const key = (v: string | undefined) => (v ?? "").replace(/\s+/g, "");

export function lineConfig() {
  return {
    channelAccessToken: key(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    channelSecret: key(process.env.LINE_CHANNEL_SECRET),
  };
}

// The base URLs are only overridden by the local end-to-end check (a fake LINE server)
export const lineClient = () =>
  new messagingApi.MessagingApiClient({ channelAccessToken: lineConfig().channelAccessToken, baseURL: process.env.LINE_API_BASE_URL || undefined });
export const lineBlobClient = () =>
  new messagingApi.MessagingApiBlobClient({ channelAccessToken: lineConfig().channelAccessToken, baseURL: process.env.LINE_DATA_API_BASE_URL || undefined });

export { LANG_SPLIT } from "./line-lang";

/** A text's language parts, in the order they were written (one part for a text that has no split) */
export const splitLangs = (text: string): string[] => text.split(LANG_SPLIT).map((s) => s.trim()).filter(Boolean);

/** Several texts (the morning reminders) as one message in the reader's language, each separated by a line */
export function langMessages(texts: string[], lang: LineLang, prefix = ""): messagingApi.TextMessage[] {
  if (!texts.length) return [];
  return [{ type: "text", text: `${prefix}${texts.map((t) => inLang(t, lang)).join("\n\n— — —\n\n")}`.slice(0, 5000) }];
}

/** A branch as the bot names it, in the reader's language */
export const lineBranchLabel = (b: { no: string; name: string }, lang: LineLang) =>
  b.name.trim() ||
  (b.no === "00000"
    ? { th: "สำนักงานใหญ่", ja: "本店", ko: "본점", en: "Head office" }[lang]
    : { th: `สาขา ${b.no}`, ja: `支店 ${b.no}`, ko: `지점 ${b.no}`, en: `Branch ${b.no}` }[lang]);

/** A branch's name in every language */
export const branchWords = (b: { no: string; name: string }): Words => ({
  th: lineBranchLabel(b, "th"),
  ja: lineBranchLabel(b, "ja"),
  ko: lineBranchLabel(b, "ko"),
  en: lineBranchLabel(b, "en"),
});

/** Buttons under a sales file: which branch is it for? (postback "branch=<id>&xl=<messageId>&fn=<file name>") */
export function salesBranchButtons(messageId: string, fileName: string, branches: { id: string; no: string; name: string }[], lang: LineLang): messagingApi.QuickReply {
  return {
    items: branches.slice(0, 13).map((b) => {
      const label = lineBranchLabel(b, lang).slice(0, 20);
      return { type: "action", action: { type: "postback", label, data: `branch=${b.id}&xl=${messageId}&fn=${encodeURIComponent(fileName).slice(0, 120)}`, displayText: label } };
    }),
  };
}

/** Buttons under the receipt card: which branch is this for? (postback "branch=<id>&doc=<id>") */
export function branchButtons(docId: string, branches: { id: string; no: string; name: string }[], lang: LineLang): messagingApi.QuickReply {
  return {
    items: branches.slice(0, 13).map((b) => {
      const label = lineBranchLabel(b, lang).slice(0, 20);
      return { type: "action", action: { type: "postback", label, data: `branch=${b.id}&doc=${docId}`, displayText: label } };
    }),
  };
}

/** Days before a document expires on which the admins are reminded */
export const DOC_REMIND_DAYS = [30, 7, 1, 0];

/** Work permits, visas … about to run out, on the reminder days only */
export function documentReminder(items: { name: string; doc: string; daysLeft: number }[], url: string, opts: { force?: boolean } = {}): string | null {
  const due = items.filter((i) => opts.force || DOC_REMIND_DAYS.includes(i.daysLeft) || i.daysLeft < 0);
  if (!due.length) return null;
  const th = (d: number) => (d < 0 ? `หมดอายุแล้ว ${-d} วัน` : d === 0 ? "หมดอายุวันนี้" : `อีก ${d} วัน`);
  const ja = (d: number) => (d < 0 ? `期限切れ ${-d}日` : d === 0 ? "本日期限" : `あと${d}日`);
  const ko = (d: number) => (d < 0 ? `만료 ${-d}일 지남` : d === 0 ? "오늘 만료" : `${d}일 남음`);
  const en = (d: number) => (d < 0 ? `expired ${-d} days ago` : d === 0 ? "expires today" : `${d} days left`);
  const list = (f: (d: number) => string, sep: string) => due.map((i) => `• ${i.name} — ${i.doc}${sep}${f(i.daysLeft)}`);
  return four(
    ["แจ้งเตือนเอกสารพนักงานใกล้หมดอายุ", "", ...list(th, ": "), "", url].join("\n"),
    ["従業員書類の期限のお知らせ", "", ...list(ja, "："), "", url].join("\n"),
    ["직원 서류 만료 알림", "", ...list(ko, ": "), "", url].join("\n"),
    ["Staff documents about to expire", "", ...list(en, ": "), "", url].join("\n"),
  );
}

export interface SalesSavedText {
  days: number;
  from: string;
  to: string;
  gross: number;
  vat: number;
  locked: number;
  invalid: number;
  /** The branch's name in each language (null = none) */
  branch: Words | null;
}

export const say = {
  fileNoColumns: four(
    "อ่านคอลัมน์ของไฟล์นี้ไม่ได้ กรุณานำเข้าในแอปหนึ่งครั้ง (ยอดขาย → POS Excel) เพื่อให้แอปจำคอลัมน์ แล้วครั้งต่อไปส่งไฟล์มาที่นี่ได้เลย",
    "このファイルの列を読み取れませんでした。アプリで一度取り込むと（売上 → POS Excel）列を覚えるので、次回からはここに送るだけで済みます。",
    "이 파일의 열을 읽지 못했어요. 앱에서 한 번 가져오면(매출 → POS 엑셀) 열을 기억해서, 다음부터는 여기로 보내기만 하면 돼요.",
    "Couldn't read this file's columns. Import it once in the app (Sales → POS Excel) so the app learns them; after that just send the file here.",
  ),
  fileNoRows: four(
    "ไม่พบแถวที่มีวันที่และยอดขาย ตรวจสอบไฟล์อีกครั้ง",
    "日付と売上金額のある行が見つかりません。ファイルを確認してください。",
    "날짜와 매출 금액이 있는 줄을 찾지 못했어요. 파일을 확인해 주세요.",
    "No rows with a date and a sales amount. Please check the file.",
  ),
  fileTooBig: four("ไฟล์ใหญ่เกินไป (เกิน 5 MB)", "ファイルが大きすぎます（5MB超）。", "파일이 너무 커요 (5MB 초과).", "The file is too big (over 5 MB)."),
  fileAlready: four("ไฟล์นี้บันทึกไว้แล้ว", "このファイルはすでに登録済みです。", "이 파일은 이미 저장했어요.", "This file is already saved."),
  fileBranchAsk: four("ยอดขายของสาขาไหน? กดเลือกด้านล่าง", "どの支店の売上ですか？下から選んでください", "어느 지점 매출인가요? 아래에서 골라 주세요", "Which branch are these sales for? Pick one below"),
  salesSaved: (s: SalesSavedText, url: string) => {
    const range = (sep: string) => `${dmy(s.from)}${s.to !== s.from ? `${sep}${dmy(s.to)}` : ""}`;
    const br = (l: LineLang) => (s.branch?.[l] ? ` · ${s.branch[l]}` : "");
    return four(
      [
        ...(s.days ? [`✓ บันทึกยอดขาย ${s.days} วัน (${range(" – ")})${br("th")}`, `รวม ${baht(s.gross)} · VAT ${baht(s.vat)}`] : ["ไม่ได้บันทึกยอดขาย"]),
        ...(s.locked ? [`ข้าม ${s.locked} วันของเดือนที่ปิดแล้ว`] : []),
        ...(s.invalid ? [`ข้าม ${s.invalid} วันที่ตัวเลขผิดปกติ`] : []),
        "",
        url,
      ].join("\n"),
      [
        ...(s.days ? [`✓ 売上 ${s.days}日分を登録しました（${range("〜")}）${br("ja")}`, `合計 ${baht(s.gross)} · VAT ${baht(s.vat)}`] : ["売上は登録されませんでした"]),
        ...(s.locked ? [`締めた月の${s.locked}日分はスキップしました`] : []),
        ...(s.invalid ? [`数字がおかしい${s.invalid}日分はスキップしました`] : []),
        "",
        url,
      ].join("\n"),
      [
        ...(s.days ? [`✓ 매출 ${s.days}일치를 저장했어요 (${range(" – ")})${br("ko")}`, `합계 ${baht(s.gross)} · 부가세 ${baht(s.vat)}`] : ["저장한 매출이 없어요"]),
        ...(s.locked ? [`마감한 달의 ${s.locked}일치는 건너뛰었어요`] : []),
        ...(s.invalid ? [`숫자가 이상한 ${s.invalid}일치는 건너뛰었어요`] : []),
        "",
        url,
      ].join("\n"),
      [
        ...(s.days ? [`✓ Saved ${s.days} day(s) of sales (${range(" – ")})${br("en")}`, `Total ${baht(s.gross)} · VAT ${baht(s.vat)}`] : ["No sales were saved"]),
        ...(s.locked ? [`Skipped ${s.locked} day(s) of a closed month`] : []),
        ...(s.invalid ? [`Skipped ${s.invalid} day(s) with odd numbers`] : []),
        "",
        url,
      ].join("\n"),
    );
  },
  duplicate: (url: string) =>
    four(
      `รูปนี้บันทึกไว้แล้ว จึงไม่ได้อ่านซ้ำ (ไม่มีค่าใช้จ่าย)\n${url}`,
      `この写真は登録済みのため、読み取りを省きました（費用なし）\n${url}`,
      `이미 저장한 사진이라 다시 읽지 않았어요 (비용 없음)\n${url}`,
      `This photo is already saved, so it wasn't read again (no cost)\n${url}`,
    ),
  branchAsk: four("สาขาไหน? กดเลือกด้านล่าง", "どの支店ですか？下から選んでください", "어느 지점인가요? 아래에서 골라 주세요", "Which branch? Pick one below"),
  branchSet: (w: Words) => four(`✓ บันทึกเป็น ${w.th}`, `✓ ${w.ja} に登録しました`, `✓ ${w.ko}(으)로 저장했어요`, `✓ Saved to ${w.en}`),
  noBranch: four(
    "ยังไม่ได้เลือกสาขา กรุณาเปิดแอปแล้วเลือกสาขา (ใส่รหัสผ่านสาขา) ก่อนส่ง",
    "店舗がまだ選ばれていません。アプリを開いて店舗を選んでから（店舗パスワードを入力）送ってください。",
    "아직 지점을 고르지 않았어요. 앱을 열어 지점을 고른 뒤(지점 비밀번호 입력) 보내 주세요.",
    "No branch chosen yet. Open the app, pick a branch (enter its PIN), then send.",
  ),
  branchNotAllowed: four(
    "สาขานี้ต้องเปิดในแอปก่อน (ใส่รหัสผ่านสาขา)",
    "この店舗は先にアプリで開いてください（店舗パスワードが必要です）。",
    "이 지점은 먼저 앱에서 열어 주세요 (지점 비밀번호 필요).",
    "Open this branch in the app first (it needs the branch PIN).",
  ),
  branchGone: four("ไม่พบสาขานั้นแล้ว เปิดแอปเพื่อเลือก", "その支店は見つかりません。アプリで選んでください", "그 지점을 찾을 수 없어요. 앱에서 골라 주세요", "That branch no longer exists. Pick one in the app"),
  welcome: four(
    "สวัสดี นี่คือบอท Sawadee TAX\nเปิดแอป → ตั้งค่า → เชื่อม LINE แล้วส่งรหัส 6 หลักมาที่แชทนี้",
    "こんにちは。Sawadee TAXのボットです。\nアプリの「設定 → LINE連携」で6桁のコードを取得し、このトークに送ってください。",
    "안녕하세요. Sawadee TAX 봇이에요.\n앱의 '설정 → LINE 연결'에서 6자리 코드를 받아 이 대화방에 보내 주세요.",
    "Hello, this is the Sawadee TAX bot.\nIn the app, open Settings → LINE, get the 6-digit code and send it to this chat.",
  ),
  linked: (name: string) =>
    four(
      `เชื่อมบัญชีแล้ว: ${name}\nส่งรูปใบกำกับภาษีหรือใบเสร็จมาได้เลย (ส่งหลายรูปพร้อมกันก็ได้)`,
      `連携しました：${name}\n請求書・領収書の写真を送ってください（複数枚まとめてもOK）。`,
      `연결했어요: ${name}\n세금계산서나 영수증 사진을 보내 주세요 (여러 장도 한 번에 돼요).`,
      `Linked: ${name}\nSend photos of tax invoices or receipts (several at once is fine).`,
    ),
  employeeLinked: (name: string) =>
    four(
      `เชื่อมบัญชีพนักงานแล้ว: ${name}\nใบแจ้งเงินเดือนจะถูกส่งมาที่แชทนี้`,
      `従業員アカウントを連携しました：${name}\n給与明細はこのトークに届きます。`,
      `직원 계정을 연결했어요: ${name}\n급여명세서가 이 대화방으로 와요.`,
      `Staff account linked: ${name}\nYour payslips will arrive in this chat.`,
    ),
  badCode: four(
    "รหัสไม่ถูกต้องหรือหมดอายุแล้ว (ใช้ได้ 10 นาที) กรุณารับรหัสใหม่ในแอป",
    "コードが違うか、期限切れです（有効期間10分）。アプリで新しいコードを取得してください。",
    "코드가 틀렸거나 만료됐어요 (10분 동안 유효). 앱에서 새 코드를 받아 주세요.",
    "The code is wrong or has expired (valid for 10 minutes). Get a new one in the app.",
  ),
  checking: four("กำลังตรวจสอบรหัสยืนยัน กรุณารอสักครู่", "認証コードを確認しています。少々お待ちください。", "인증 코드를 확인하고 있어요. 잠시만 기다려 주세요.", "Checking the code, one moment please."),
  tooManyTries: four(
    "ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่",
    "コードの入力ミスが多すぎます。10分後にもう一度お試しください。",
    "코드를 너무 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.",
    "Too many wrong codes. Please try again in 10 minutes.",
  ),
  notDoc: four("รูปนี้ไม่น่าจะเป็นใบกำกับภาษีหรือใบเสร็จ", "この写真は請求書・領収書ではないようです。", "이 사진은 세금계산서나 영수증이 아닌 것 같아요.", "This photo doesn't look like a tax invoice or receipt."),
  unreadable: four(
    "อ่านรูปไม่ได้ กรุณาถ่ายใหม่ในที่สว่างให้เห็นเอกสารทั้งแผ่น",
    "読み取れませんでした。明るい場所で書類全体が写るように撮り直してください。",
    "읽지 못했어요. 밝은 곳에서 서류 전체가 보이게 다시 찍어 주세요.",
    "Couldn't read it. Please retake the photo in good light with the whole document visible.",
  ),
  tooBig: four(
    "รูปใหญ่เกินไป (เกิน 4.5 MB) กรุณาส่งแบบคุณภาพปกติ",
    "画像が大きすぎます（4.5MB超）。通常画質で送ってください。",
    "사진이 너무 커요 (4.5MB 초과). 일반 화질로 보내 주세요.",
    "The photo is too big (over 4.5 MB). Please send it in normal quality.",
  ),
  received: four(
    "กำลังส่งรูปภาพอยู่ เมื่อเสร็จแล้วจะแจ้งให้ทราบ\nกรุณารอสักครู่",
    "画像を送信中です。完了しましたらお知らせします。\n少々お待ちください。",
    "사진을 받는 중이에요. 끝나면 알려 드릴게요.\n잠시만 기다려 주세요.",
    "Receiving your photo. I'll let you know when it's done.\nOne moment please.",
  ),
  rate: four("ส่งรูปถี่เกินไป กรุณารอสักครู่แล้วส่งใหม่", "送信が多すぎます。少し待ってからもう一度送ってください。", "너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요.", "Too many at once. Please wait a moment and send again."),
  failed: four("ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง", "一時的なエラーです。しばらくしてからもう一度お試しください。", "일시적인 오류예요. 잠시 뒤에 다시 해 주세요.", "A temporary error. Please try again later."),
};

/** Days before the VAT return's deadline on which the admins get a LINE reminder */
export const VAT_REMIND_DAYS = [3, 1];

export interface VatReminder {
  /** Tax month being filed, YYYY-MM */
  month: string;
  /** The deadline that counts now (paper, or the online one after it) */
  due: string;
  daysLeft: number;
  toCheck: number;
  drafts: number;
  claimableVat: number;
}

const thMonth = (y: string, m: string) => `${m}/${Number(y) + 543}`;
const enMonth = (y: string, m: string) => new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The VAT return (ภ.พ.30) reminder — sent only a few days before the deadline and only while the month is still
 * open, with what is left to do.
 */
export function vatReminder(v: VatReminder, url: string, opts: { force?: boolean } = {}): string | null {
  if (!opts.force && !VAT_REMIND_DAYS.includes(v.daysLeft)) return null;
  const [y, m] = v.month.split("-");
  const todo = v.toCheck + v.drafts;
  return four(
    [
      "แจ้งเตือนยื่น ภ.พ.30",
      `เดือนภาษี ${thMonth(y, m)} · ยื่นภายใน ${dmy(v.due)} (อีก ${v.daysLeft} วัน)`,
      "",
      `ภาษีซื้อที่ขอคืนได้: ${baht(v.claimableVat)}`,
      todo ? `ต้องตรวจ ${v.toCheck} · ฉบับร่าง ${v.drafts} — กรุณาจัดการก่อนยื่น` : "เอกสารพร้อมยื่นแล้ว",
      "",
      url,
    ].join("\n"),
    [
      "付加価値税（VAT）申告のお知らせ",
      `${y}年${Number(m)}月分 · 期限 ${dmy(v.due)}（あと${v.daysLeft}日）`,
      "",
      `控除できる仕入VAT：${baht(v.claimableVat)}`,
      todo ? `要確認 ${v.toCheck}件 · 下書き ${v.drafts}件 — 申告前に整理してください` : "書類は申告の準備ができています",
      "",
      url,
    ].join("\n"),
    [
      "부가세(ภ.พ.30) 신고 알림",
      `${y}년 ${Number(m)}월분 · 기한 ${dmy(v.due)} (${v.daysLeft}일 남음)`,
      "",
      `공제받을 매입 부가세: ${baht(v.claimableVat)}`,
      todo ? `확인 필요 ${v.toCheck}건 · 임시저장 ${v.drafts}건 — 신고 전에 정리해 주세요` : "신고할 서류가 준비됐어요",
      "",
      url,
    ].join("\n"),
    [
      "VAT return (ภ.พ.30) reminder",
      `${enMonth(y, m)} · due ${dmy(v.due)} (${v.daysLeft} days left)`,
      "",
      `Claimable input VAT: ${baht(v.claimableVat)}`,
      todo ? `To check ${v.toCheck} · drafts ${v.drafts} — please sort them out before filing` : "The documents are ready to file",
      "",
      url,
    ].join("\n"),
  );
}

export interface WhtReminder {
  /** Month the payments were made in, YYYY-MM */
  month: string;
  due: string;
  daysLeft: number;
  pnd53: { count: number; tax: number };
  pnd3: { count: number; tax: number };
}

/**
 * The withholding returns on payments to suppliers (ภ.ง.ด.53 companies, ภ.ง.ด.3 people), owner 2026-10-15: due like
 * ภ.ง.ด.1 (paper the 7th, online the 15th of the next month), on the same reminder days, only when tax was withheld.
 */
export function whtReminder(v: WhtReminder, url: string, opts: { force?: boolean } = {}): string | null {
  if (!opts.force && !VAT_REMIND_DAYS.includes(v.daysLeft)) return null;
  if (!v.pnd53.count && !v.pnd3.count) return null;
  const [y, m] = v.month.split("-");
  const forms = [v.pnd53.count ? "ภ.ง.ด.53" : "", v.pnd3.count ? "ภ.ง.ด.3" : ""].filter(Boolean).join(" / ");
  const lines = (corp: string, person: string, unit: string, tax: string) => [
    ...(v.pnd53.count ? [`ภ.ง.ด.53 (${corp}): ${v.pnd53.count} ${unit} · ${tax} ${baht(v.pnd53.tax)}`] : []),
    ...(v.pnd3.count ? [`ภ.ง.ด.3 (${person}): ${v.pnd3.count} ${unit} · ${tax} ${baht(v.pnd3.tax)}`] : []),
  ];
  return four(
    [`แจ้งเตือนยื่น ${forms}`, `เดือนที่จ่าย ${thMonth(y, m)} · ยื่นภายใน ${dmy(v.due)} (อีก ${v.daysLeft} วัน)`, "", ...lines("นิติบุคคล", "บุคคลธรรมดา", "ราย", "ภาษี"), "", url].join("\n"),
    [
      "源泉徴収（仕入先）申告のお知らせ",
      `${y}年${Number(m)}月の支払い分 · 期限 ${dmy(v.due)}（あと${v.daysLeft}日）`,
      "",
      ...(v.pnd53.count ? [`ภ.ง.ด.53（法人）：${v.pnd53.count}件 · 税額 ${baht(v.pnd53.tax)}`] : []),
      ...(v.pnd3.count ? [`ภ.ง.ด.3（個人）：${v.pnd3.count}件 · 税額 ${baht(v.pnd3.tax)}`] : []),
      "",
      url,
    ].join("\n"),
    [`원천세(${forms}) 신고 알림`, `${y}년 ${Number(m)}월 지급분 · 기한 ${dmy(v.due)} (${v.daysLeft}일 남음)`, "", ...lines("법인", "개인", "건", "세액"), "", url].join("\n"),
    [
      `Withholding tax return (${forms}) reminder`,
      `Payments in ${enMonth(y, m)} · due ${dmy(v.due)} (${v.daysLeft} days left)`,
      "",
      ...lines("companies", "individuals", "payee(s)", "tax"),
      "",
      url,
    ].join("\n"),
  );
}

export interface PayrollReminder {
  /** Pay month being filed, YYYY-MM */
  month: string;
  pnd1Paper: string;
  due: string;
  daysLeft: number;
  wht: number;
  /** Employees' and the company's social security together */
  ss: number;
}

/** The payroll filings (ภ.ง.ด.1, สปส.1-10) reminder, on the same days before the deadline as the VAT one */
export function payrollReminder(v: PayrollReminder, url: string, opts: { force?: boolean } = {}): string | null {
  if (!opts.force && !VAT_REMIND_DAYS.includes(v.daysLeft)) return null;
  const [y, m] = v.month.split("-");
  return four(
    [
      "แจ้งเตือนยื่น ภ.ง.ด.1 และ สปส.1-10",
      `เดือน ${thMonth(y, m)} · ยื่นภายใน ${dmy(v.due)} (อีก ${v.daysLeft} วัน)`,
      "",
      `ภาษีหัก ณ ที่จ่าย: ${baht(v.wht)}`,
      `เงินสมทบประกันสังคม (ลูกจ้าง + นายจ้าง): ${baht(v.ss)}`,
      "",
      url,
    ].join("\n"),
    ["源泉税・社会保険の申告のお知らせ", `${y}年${Number(m)}月分 · 期限 ${dmy(v.due)}（あと${v.daysLeft}日）`, "", `源泉徴収税：${baht(v.wht)}`, `社会保険料（本人＋会社）：${baht(v.ss)}`, "", url].join("\n"),
    [
      "급여 원천세 · 사회보험 신고 알림 (ภ.ง.ด.1 · สปส.1-10)",
      `${y}년 ${Number(m)}월분 · 기한 ${dmy(v.due)} (${v.daysLeft}일 남음)`,
      "",
      `원천징수 세액: ${baht(v.wht)}`,
      `사회보험료 (직원 + 회사): ${baht(v.ss)}`,
      "",
      url,
    ].join("\n"),
    [
      "Payroll filings reminder (ภ.ง.ด.1 · สปส.1-10)",
      `${enMonth(y, m)} · due ${dmy(v.due)} (${v.daysLeft} days left)`,
      "",
      `Tax withheld: ${baht(v.wht)}`,
      `Social security (staff + company): ${baht(v.ss)}`,
      "",
      url,
    ].join("\n"),
  );
}

/** LINE sends photos as JPEG, but look at the bytes rather than trust that */
export function imageType(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Card colours: the app's system blue and status colours, white card, hairline separators
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const BLUE = "#0071e3";

const row = (label: string, value: string, strong = false): messagingApi.FlexBox => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: strong ? "sm" : "xs", color: strong ? INK : MUTED, weight: strong ? "bold" : "regular", flex: 3, wrap: true, gravity: "center" },
    { type: "text", text: value, size: strong ? "xl" : "sm", color: INK, weight: strong ? "bold" : "regular", align: "end", flex: 4, gravity: "center" },
  ],
});

const CARD: Record<LineLang, { toCheck: (n: number) => string; ok: string; saved: string; vat: string; due: string; total: string; open: string; alt: string }> = {
  th: { toCheck: (n) => `ต้องตรวจ ${n} รายการ`, ok: "ตรวจอัตโนมัติผ่าน", saved: "บันทึกลงสมุดบัญชีแล้ว", vat: "VAT", due: "ครบกำหนด", total: "ยอดสุทธิ", open: "เปิดในแอป", alt: "บันทึกแล้ว" },
  ja: { toCheck: (n) => `要確認 ${n}件`, ok: "自動チェックOK", saved: "台帳に登録しました", vat: "消費税", due: "支払期限", total: "合計", open: "アプリで開く", alt: "登録しました" },
  ko: { toCheck: (n) => `확인 필요 ${n}건`, ok: "자동 확인 통과", saved: "장부에 저장했어요", vat: "부가세", due: "지급 기한", total: "합계", open: "앱에서 열기", alt: "저장했어요" },
  en: { toCheck: (n) => `${n} to check`, ok: "Automatic checks passed", saved: "Saved to the ledger", vat: "VAT", due: "Due", total: "Total", open: "Open in the app", alt: "Saved" },
};
const CHECK_NAMES: Record<LineLang, Record<string, string>> = { th: th.checks, ja: ja.checks, ko: ko.checks, en: en.checks };

/** The reply for a saved document: who, how much, what the automatic checks found, and a link to it */
export function receiptCard(doc: LedgerDoc, checks: CheckResult[], url: string, lang: LineLang): messagingApi.FlexMessage {
  const L = CARD[lang];
  const names = doc.seller.name;
  const seller = (lang === "ja" ? names.ja || names.en || names.th : lang === "th" ? names.th || names.en || names.ja : names.en || names.th || names.ja) || "—";
  const problems = checks.filter((c) => !c.na && !c.ok);
  const meta = [doc.docNo, doc.date && dmy(doc.date)].filter(Boolean).join(" · ") || "—";
  const net = baht(doc.totals.net);

  const status: messagingApi.FlexBox = problems.length
    ? {
        type: "box",
        layout: "vertical",
        backgroundColor: "#fff4e5",
        cornerRadius: "12px",
        paddingAll: "12px",
        spacing: "xs",
        contents: [
          { type: "text", text: L.toCheck(problems.length), size: "xs", weight: "bold", color: "#b25000" },
          ...problems.slice(0, 3).map(
            (c): messagingApi.FlexText => ({
              type: "text",
              text: `• ${CHECK_NAMES[lang][c.key] ?? c.key}`,
              size: "xxs",
              color: "#8a4b00",
              wrap: true,
            }),
          ),
        ],
      }
    : {
        type: "box",
        layout: "vertical",
        backgroundColor: "#e9f7ee",
        cornerRadius: "12px",
        paddingAll: "12px",
        contents: [{ type: "text", text: L.ok, size: "xs", weight: "bold", color: "#1a7f37" }],
      };

  return {
    type: "flex",
    altText: `${L.alt} ${net} ${seller}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: [
          // The Apple Intelligence spectrum, as a hairline accent only
          {
            type: "box",
            layout: "vertical",
            height: "4px",
            contents: [],
            background: { type: "linearGradient", angle: "90deg", startColor: "#0894ff", centerColor: "#c959dd", endColor: "#ff9004" },
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            spacing: "md",
            contents: [
              { type: "text", text: L.saved, size: "xxs", color: MUTED, weight: "bold", wrap: true },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  { type: "text", text: seller, size: "md", weight: "bold", color: INK, wrap: true },
                  { type: "text", text: meta, size: "xs", color: MUTED, margin: "xs", wrap: true },
                ],
              },
              { type: "separator", color: "#e5e5ea" },
              row(L.vat, baht(doc.totals.vat)),
              ...(doc.dueDate && !doc.paid ? [row(L.due, dmy(doc.dueDate))] : []),
              row(L.total, net, true),
              status,
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        paddingTop: "0px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: BLUE,
            height: "sm",
            action: { type: "uri", label: L.open, uri: url },
          },
        ],
      },
    },
  };
}
