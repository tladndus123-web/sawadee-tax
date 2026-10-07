// Thai PromptPay QR (EMVCo merchant-presented QR, Bank of Thailand standard): the text any Thai banking app scans to
// pay a phone number, a tax ID (13 digits) or an e-wallet ID (15 digits), with the amount filled in when given.
// Vendors' transfer details (owner, 2026-10-08) show this QR next to bills to pay.

export type PromptPayKind = "phone" | "taxId" | "ewallet";

/** What kind of PromptPay ID this is (digits only), or null when it is none */
export function promptPayKind(id: string): PromptPayKind | null {
  const d = id.replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) return "phone";
  if (/^\d{13}$/.test(d)) return "taxId";
  if (/^\d{15}$/.test(d)) return "ewallet";
  return null;
}

const field = (tag: string, value: string) => tag + String(value.length).padStart(2, "0") + value;

/** CRC-16/CCITT-FALSE (poly 0x1021, start 0xFFFF), 4 upper-case hex digits */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const ch of new TextEncoder().encode(text)) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The QR text for a PromptPay ID; `amount` in baht (2 decimals), left out for "type the amount yourself" */
export function promptPayPayload(id: string, amount?: number): string {
  const d = id.replace(/\D/g, "");
  const kind = promptPayKind(d);
  if (!kind) throw new Error("bad PromptPay ID");
  // A phone number goes in as 0066 + the number without its leading 0, 13 digits
  const target = kind === "phone" ? ("0000000000000" + "66" + d.slice(1)).slice(-13) : d;
  const tag = kind === "phone" ? "01" : kind === "taxId" ? "02" : "03";
  const withAmount = amount !== undefined && amount > 0;
  const data =
    field("00", "01") +
    field("01", withAmount ? "12" : "11") +
    field("29", field("00", "A000000677010111") + field(tag, target)) +
    field("58", "TH") +
    field("53", "764") +
    (withAmount ? field("54", amount.toFixed(2)) : "") +
    "6304";
  return data + crc16(data);
}

/** Thai banks for the vendor's account (code → names); the code is what is stored */
export const THAI_BANKS = [
  ["kbank", "Kasikornbank", "กสิกรไทย"],
  ["scb", "SCB", "ไทยพาณิชย์"],
  ["bbl", "Bangkok Bank", "กรุงเทพ"],
  ["ktb", "Krungthai", "กรุงไทย"],
  ["bay", "Krungsri", "กรุงศรีอยุธยา"],
  ["ttb", "ttb", "ทหารไทยธนชาต"],
  ["gsb", "GSB", "ออมสิน"],
  ["uob", "UOB", "ยูโอบี"],
  ["cimb", "CIMB Thai", "ซีไอเอ็มบี ไทย"],
  ["kkp", "Kiatnakin Phatra", "เกียรตินาคินภัทร"],
  ["lhb", "LH Bank", "แลนด์ แอนด์ เฮ้าส์"],
  ["baac", "BAAC", "ธ.ก.ส."],
  ["tisco", "TISCO", "ทิสโก้"],
  ["icbc", "ICBC Thai", "ไอซีบีซี (ไทย)"],
] as const;

export const bankName = (code: string, lang: string): string => {
  const b = THAI_BANKS.find(([c]) => c === code);
  return b ? (lang === "th" ? b[2] : b[1]) : code;
};
