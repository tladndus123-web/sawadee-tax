// Things that go wrong by themselves as time passes (owner 2026-11-21: "앞으로 오류가 날 수 있는 것"), caught early.
// Pure rules; lib/reminders-server puts them in the morning LINE reminder for owners and unlimited admins.
//   - the Thai holiday list (lib/thai-holidays) must have the coming year before it starts, or filing deadlines that fall
//     on a holiday stop moving to the next working day;
//   - social security's wage ceiling rises by law (17,500 in 2026–2028, 20,000 in 2029–2031, 23,000 from 2032): a month
//     is paid on at least the legal ceiling of its year, whatever was saved in settings;
//   - the AI receipt reading keeps failing (a retired model, a key problem).

import { four } from "./line-lang";
import type { PayrollSettings } from "./payroll";
import { THAI_HOLIDAYS } from "./thai-holidays";

/** The year whose holidays are missing and needed soon (this year, or next year from October), else null */
export function holidaysMissing(today: string, holidays: ReadonlySet<string> = THAI_HOLIDAYS): number | null {
  const year = Number(today.slice(0, 4));
  const has = (y: number) => [...holidays].some((d) => d.startsWith(`${y}-`));
  if (!has(year)) return year;
  if (Number(today.slice(5, 7)) >= 10 && !has(year + 1)) return year + 1;
  return null;
}

/** Social security wage ceiling set by law for a month's year (baht) */
export function legalCeiling(month: string): number {
  const year = Number(month.slice(0, 4));
  if (year >= 2032) return 23_000;
  if (year >= 2029) return 20_000;
  return 17_500;
}

/** The settings a month is paid with: the saved ones, with the ceiling raised to the law of that year when lower */
export const settingsForMonth = (s: PayrollSettings, month: string): PayrollSettings => (s.ssCeiling >= legalCeiling(month) ? s : { ...s, ssCeiling: legalCeiling(month) });

/** The last day's readings: tell the owner when most of them failed (at least 3 failures) */
export function readingTrouble(lines: readonly { ok: boolean; code: string }[]): { failed: number; worked: number; code: string } | null {
  const failed = lines.filter((l) => !l.ok);
  const worked = lines.length - failed.length;
  if (failed.length < 3 || failed.length <= worked) return null;
  const by = new Map<string, number>();
  for (const l of failed) by.set(l.code, (by.get(l.code) ?? 0) + 1);
  const code = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { failed: failed.length, worked, code };
}

export const holidaysText = (year: number) =>
  four(
    `⚠ ยังไม่มีวันหยุดราชการปี ${year} ในแอป กำหนดยื่นภาษีที่ตรงวันหยุดจะไม่เลื่อนให้ — กรุณาแจ้งผู้ดูแลระบบ`,
    `⚠ アプリに${year}年のタイの祝日がまだありません。祝日に重なる申告期限が後ろにずれません。管理担当に伝えてください。`,
    `⚠ 앱에 ${year}년 태국 공휴일이 아직 없어요. 공휴일과 겹치는 신고 마감이 다음 평일로 밀리지 않아요. 개발 담당에게 알려 주세요.`,
    `⚠ The app has no Thai holidays for ${year} yet, so filing deadlines on a holiday will not move to the next working day. Please tell whoever maintains the app.`,
  );

export const readingText = (t: { failed: number; worked: number; code: string }) =>
  four(
    `⚠ การอ่านใบเสร็จด้วย AI ล้มเหลว ${t.failed} ครั้งใน 24 ชั่วโมง (สำเร็จ ${t.worked} ครั้ง · ${t.code}) ถ้ายังเป็นอยู่ กรุณาแจ้งผู้ดูแลระบบ`,
    `⚠ AIによるレシート読み取りが24時間で${t.failed}回失敗しました（成功${t.worked}回・${t.code}）。続くようなら管理担当に伝えてください。`,
    `⚠ 지난 24시간 동안 AI 영수증 읽기가 ${t.failed}번 실패했어요 (성공 ${t.worked}번 · ${t.code}). 계속되면 개발 담당에게 알려 주세요.`,
    `⚠ AI receipt reading failed ${t.failed} times in the last 24 hours (${t.worked} worked · ${t.code}). If it goes on, please tell whoever maintains the app.`,
  );
