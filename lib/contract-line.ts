// Contracts on LINE (계약서함, 2026-11-18; simpler than the for-sale version: one photo or one PDF = one contract):
// "계약서" / "契約書" / "สัญญา" / "contract" typed by an admin → contract mode for 10 minutes (line_modes 'contract');
// the next photo or PDF is read by the contract reader (lib/contract-read-server) and saved in the contract box with
// its file; the answer is a card (lib/line-dash noticeMessage) with what was saved and a link to /contracts. Staff are
// refused. Pure: the words in the four languages, the trigger word, the file's type and the card's text. The sending
// is lib/contract-line-server.

import type { ContractReading } from "./contract-read";
import type { ContractKind } from "./contracts";
import type { LineLang } from "./line-lang";
import { bahtWhole } from "./money";

/** How long contract mode waits for the file */
export const CONTRACT_MODE_MINUTES = 10;

/** "계약서", "契約書", "สัญญา", "contract" … typed to the bot: start contract mode */
export const isContractWord = (t: string) => /^\s*(계약서|계약서\s*(등록|저장|보관)|계약서함|契約書|契約書\s*(登録|保存)|สัญญา|เก็บสัญญา|contract|contracts)\s*$/i.test(t);

/** A file message that may be a contract (by its name) */
export const isContractFileName = (name: string) => /\.(pdf|jpe?g|png|webp)$/i.test(name.trim());

/** A sent file's type from its first bytes: a JPEG / PNG / WebP photo or a PDF, else null */
export function contractFileType(buf: Uint8Array): { type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; ext: string } | null {
  const at = (i: number) => buf[i];
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.slice(from, to));
  if (buf.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return { type: "image/png", ext: "png" };
  if (buf.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (buf.length > 5 && ascii(0, 5) === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  return null;
}

interface Words {
  modeOn: string;
  adminOnly: string;
  notMember: string;
  saved: string;
  savedSub: string;
  savedUnread: string;
  savedUnreadSub: string;
  notContract: string;
  notFile: string;
  tooBig: string;
  rate: string;
  party: string;
  kind: string;
  period: string;
  amount: string;
  renew: string;
  yes: string;
  untitled: string;
  kinds: Record<ContractKind, string>;
}

const W: Record<LineLang, Words> = {
  ko: {
    modeOn: "📄 계약서 모드예요. 10분 안에 계약서 사진이나 PDF를 한 장 보내 주세요. AI가 읽어서 계약서함에 넣어 드릴게요.",
    adminOnly: "계약서함은 관리자만 쓸 수 있어요.",
    notMember: "계약서는 앱 계정이 있는 관리자만 보낼 수 있어요. 앱의 설정에서 LINE을 연결해 주세요.",
    saved: "✓ 계약서함에 저장했어요",
    savedSub: "앱에서 내용을 확인해 주세요",
    savedUnread: "✓ 계약서 파일을 저장했어요",
    savedUnreadSub: "AI가 읽지 못했어요. 앱에서 내용을 적어 주세요",
    notContract: "계약서로 보이지 않아요. 계약서 전체가 보이게 다시 보내 주세요.",
    notFile: "사진(JPG·PNG) 또는 PDF만 받을 수 있어요.",
    tooBig: "파일이 너무 커요 (최대 15MB).",
    rate: "조금 뒤에 다시 보내 주세요.",
    party: "상대방",
    kind: "종류",
    period: "기간",
    amount: "금액",
    renew: "자동 갱신",
    yes: "예",
    untitled: "LINE으로 받은 계약서",
    kinds: { lease: "임대차", supply: "공급·구매", service: "용역·서비스", employment: "고용", loan: "대출", insurance: "보험", partnership: "동업·투자", other: "기타" },
  },
  ja: {
    modeOn: "📄 契約書モードです。10分以内に契約書の写真か PDF を1つ送ってください。AI が読んで契約書ボックスに入れます。",
    adminOnly: "契約書ボックスは管理者だけが使えます。",
    notMember: "契約書を送れるのはアプリのアカウントがある管理者だけです。アプリの設定で LINE を連携してください。",
    saved: "✓ 契約書ボックスに保存しました",
    savedSub: "アプリで内容を確認してください",
    savedUnread: "✓ 契約書のファイルを保存しました",
    savedUnreadSub: "AI が読めませんでした。アプリで内容を入力してください",
    notContract: "契約書ではないようです。全体が写るように送り直してください。",
    notFile: "写真（JPG・PNG）か PDF だけ受け取れます。",
    tooBig: "ファイルが大きすぎます（最大 15MB）。",
    rate: "少し待ってからもう一度送ってください。",
    party: "相手",
    kind: "種類",
    period: "期間",
    amount: "金額",
    renew: "自動更新",
    yes: "あり",
    untitled: "LINE で受け取った契約書",
    kinds: { lease: "賃貸借", supply: "供給・購入", service: "業務委託・サービス", employment: "雇用", loan: "借入", insurance: "保険", partnership: "共同事業・出資", other: "その他" },
  },
  th: {
    modeOn: "📄 โหมดสัญญา ส่งรูปหรือ PDF ของสัญญา 1 ไฟล์ภายใน 10 นาที AI จะอ่านและเก็บไว้ในกล่องสัญญา",
    adminOnly: "กล่องสัญญาใช้ได้เฉพาะผู้ดูแลเท่านั้น",
    notMember: "ส่งสัญญาได้เฉพาะผู้ดูแลที่มีบัญชีในแอป กรุณาเชื่อม LINE ในหน้าตั้งค่าของแอป",
    saved: "✓ เก็บไว้ในกล่องสัญญาแล้ว",
    savedSub: "กรุณาตรวจรายละเอียดในแอป",
    savedUnread: "✓ เก็บไฟล์สัญญาแล้ว",
    savedUnreadSub: "AI อ่านไม่ได้ กรุณากรอกรายละเอียดในแอป",
    notContract: "ดูไม่เหมือนสัญญา กรุณาส่งใหม่ให้เห็นทั้งฉบับ",
    notFile: "รับได้เฉพาะรูป (JPG · PNG) หรือ PDF",
    tooBig: "ไฟล์ใหญ่เกินไป (สูงสุด 15MB)",
    rate: "กรุณารอสักครู่แล้วส่งใหม่",
    party: "คู่สัญญา",
    kind: "ประเภท",
    period: "ระยะเวลา",
    amount: "จำนวนเงิน",
    renew: "ต่ออายุอัตโนมัติ",
    yes: "ใช่",
    untitled: "สัญญาที่ได้รับทาง LINE",
    kinds: { lease: "เช่า", supply: "ซื้อขาย", service: "จ้างทำของ · บริการ", employment: "จ้างงาน", loan: "กู้ยืม", insurance: "ประกันภัย", partnership: "หุ้นส่วน · ลงทุน", other: "อื่นๆ" },
  },
  en: {
    modeOn: "📄 Contract mode. Send one photo or PDF of the contract within 10 minutes. The AI reads it and puts it in the contract box.",
    adminOnly: "Only admins can use the contract box.",
    notMember: "Only admins with an app account can send contracts. Link LINE in the app's settings.",
    saved: "✓ Saved in the contract box",
    savedSub: "Please check it in the app",
    savedUnread: "✓ Contract file saved",
    savedUnreadSub: "The AI couldn't read it. Please fill it in in the app",
    notContract: "This doesn't look like a contract. Send it again with the whole page in view.",
    notFile: "Only photos (JPG · PNG) or PDFs can be taken.",
    tooBig: "The file is too big (15 MB at most).",
    rate: "Please wait a moment and send it again.",
    party: "With",
    kind: "Kind",
    period: "Period",
    amount: "Amount",
    renew: "Renews itself",
    yes: "Yes",
    untitled: "Contract from LINE",
    kinds: { lease: "Lease", supply: "Supply", service: "Service", employment: "Employment", loan: "Loan", insurance: "Insurance", partnership: "Partnership", other: "Other" },
  },
};

export const contractWords = (lang: LineLang): Words => W[lang];

/** A day as people write it (Thai in the Buddhist year), short */
export function lineDay(iso: string, lang: LineLang): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  if (lang === "ko") return `${y}.${m}.${d}`;
  if (lang === "ja") return `${y}/${m}/${d}`;
  return lang === "th" ? `${d}/${m}/${y + 543}` : `${d}/${m}/${y}`;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The card's text for noticeBubble (lib/line-dash): title line, the line under it, "label: value" rows (values ≤ 26
 * characters so they stay rows), the link last. `reading` null = saved without the AI's fields.
 */
export function savedCardText(reading: ContractReading | null, url: string, lang: LineLang): string {
  const w = W[lang];
  if (!reading) return [w.savedUnread, w.savedUnreadSub, url].join("\n");
  const rows: string[] = [];
  if (reading.party) rows.push(`${w.party}: ${cut(reading.party, 26)}`);
  rows.push(`${w.kind}: ${w.kinds[reading.kind]}`);
  if (reading.startOn || reading.endOn) rows.push(`${w.period}: ${reading.startOn ? lineDay(reading.startOn, lang) : "…"} – ${reading.endOn ? lineDay(reading.endOn, lang) : "…"}`);
  if (reading.amount !== null) rows.push(`${w.amount}: ${bahtWhole(reading.amount / 100)}`);
  if (reading.autoRenew) rows.push(`${w.renew}: ${w.yes}`);
  return [w.saved, cut(reading.title, 60), ...rows, url].join("\n");
}
