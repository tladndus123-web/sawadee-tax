// 💡 TIP under every LINE dashboard card, and the next questions as buttons (owner, 2026-10-26: "보고하고 밑에 TIP").
// The menu cards' tips are worked out from the numbers here (no AI cost); the AI assistant writes its own.
// A question button sends its words as a message, so the AI assistant answers it with a card.

import type { LineLang } from "./line-lang";
import { baht } from "./money";

export interface CardTip {
  /** e.g. "Month-end forecast" */
  title: string;
  main: string;
  note?: string;
}

export interface CardExtra {
  tip?: CardTip | null;
  /** Next questions (button labels, at most 20 characters; the label is also the message sent) */
  next?: string[];
}

export type CardKind = "summary" | "due" | "vat" | "sales" | "excel" | "weekly";

/** The questions offered under each card */
export const NEXT: Record<CardKind, Record<LineLang, string[]>> = {
  summary: {
    ko: ["📈 다음 달 매출 예상은?", "🥬 원가율 줄이려면?", "🏆 많이 쓴 거래처 TOP5", "↔️ 지난달과 비교"],
    ja: ["📈 来月の売上予想は？", "🥬 原価率を下げるには？", "🏆 仕入先TOP5", "↔️ 先月と比べて"],
    th: ["📈 ยอดขายเดือนหน้า", "🥬 ลดต้นทุนอย่างไร", "🏆 ผู้ขายท็อป 5", "↔️ เทียบเดือนก่อน"],
    en: ["📈 Sales forecast", "🥬 Cut food cost", "🏆 Top 5 suppliers", "↔️ vs last month"],
  },
  due: {
    ko: ["💰 이번 주 현금 괜찮아?", "📋 지급 일정 짜줘", "⏰ 기한 지난 것만"],
    ja: ["💰 今週の資金は大丈夫？", "📋 支払い計画を立てて", "⏰ 期限切れだけ"],
    th: ["💰 เงินสดพอไหม", "📋 วางแผนการจ่าย", "⏰ เฉพาะที่เลยกำหนด"],
    en: ["💰 Enough cash?", "📋 Plan my payments", "⏰ Only overdue ones"],
  },
  vat: {
    ko: ["🔎 공제 안 된 영수증", "✅ 신고 전 체크리스트", "📅 다음 달 부가세 예상"],
    ja: ["🔎 控除されない領収書", "✅ 申告前チェック", "📅 来月のVAT予想"],
    th: ["🔎 ขอคืนภาษีไม่ได้", "✅ เช็กก่อนยื่น", "📅 VAT เดือนหน้า"],
    en: ["🔎 Unclaimable VAT", "✅ Filing checklist", "📅 Next month's VAT"],
  },
  sales: {
    ko: ["📆 요일별 매출 보기", "🛵 배달앱 수수료 얼마?", "📈 이번 달 매출 예상"],
    ja: ["📆 曜日別の売上", "🛵 デリバリー手数料は？", "📈 今月の売上予想"],
    th: ["📆 ยอดขายตามวัน", "🛵 ค่าคอมเดลิเวอรี่", "📈 คาดการณ์เดือนนี้"],
    en: ["📆 Sales by weekday", "🛵 Delivery app fees?", "📈 Month forecast"],
  },
  excel: {
    ko: ["🧾 이번 달 매입 요약", "📊 항목별 비용"],
    ja: ["🧾 今月の仕入まとめ", "📊 科目別の費用"],
    th: ["🧾 ยอดซื้อเดือนนี้", "📊 ค่าใช้จ่ายตามหมวด"],
    en: ["🧾 Purchases so far", "📊 Costs by category"],
  },
  weekly: {
    ko: ["📈 다음 달 매출 예상은?", "⚖️ 손익분기점까지 얼마?", "👥 인건비 비율 괜찮아?"],
    ja: ["📈 来月の売上予想は？", "⚖️ 損益分岐点まであと？", "👥 人件費率は大丈夫？"],
    th: ["📈 ยอดขายเดือนหน้า", "⚖️ จุดคุ้มทุน", "👥 ค่าแรงสูงไหม"],
    en: ["📈 Sales forecast", "⚖️ Break-even?", "👥 Is labour cost OK?"],
  },
};

const T = {
  forecast: { ko: "월말 예상", ja: "月末の見込み", th: "คาดการณ์สิ้นเดือน", en: "Month-end forecast" },
  cash: { ko: "현금 흐름", ja: "資金繰り", th: "กระแสเงินสด", en: "Cash flow" },
  claim: { ko: "놓친 공제", ja: "控除もれ", th: "ภาษีซื้อที่เสียไป", en: "VAT you can't claim" },
  ready: { ko: "신고 준비", ja: "申告の準備", th: "พร้อมยื่น", en: "Filing" },
  pattern: { ko: "평소와 비교", ja: "いつもと比べて", th: "เทียบกับปกติ", en: "Compared with usual" },
  excel: { ko: "회계사에게", ja: "会計士へ", th: "ส่งให้นักบัญชี", en: "For your accountant" },
  costs: { ko: "비용 구성", ja: "費用の内訳", th: "โครงสร้างต้นทุน", en: "Where the money goes" },
};

const WD: Record<LineLang, string[]> = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  th: ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const sgn = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}%`;

/** Month so far → where it ends at this pace (against the target, else against last month) */
export function forecastTip(
  p: { sales: number; daysDone: number; daysInMonth: number; target: number; lastMonthSales: number; month: string },
  lang: LineLang,
): CardTip | null {
  if (p.sales <= 0 || p.daysDone <= 0) return null;
  const fc = Math.round((p.sales / p.daysDone) * p.daysInMonth);
  const left = p.daysInMonth - p.daysDone;
  const m = Number(p.month.slice(5, 7));
  const vsTarget = p.target > 0 ? Math.round((fc / p.target) * 100) : null;
  const vsLast = p.lastMonthSales > 0 ? ((fc - p.lastMonthSales) / p.lastMonthSales) * 100 : null;
  const perDay = p.target > fc && left > 0 ? Math.round((p.target - p.sales) / left) : null;
  const main = {
    ko: `지금 속도면 ${m}월 매출은 약 ${baht(fc)}${vsTarget !== null ? ` (목표의 ${vsTarget}%)` : vsLast !== null ? ` (지난달 ${sgn(vsLast)})` : ""}예요.`,
    ja: `このペースだと${m}月の売上は約${baht(fc)}${vsTarget !== null ? `（目標の${vsTarget}%）` : vsLast !== null ? `（先月比 ${sgn(vsLast)}）` : ""}です。`,
    th: `ถ้าขายแบบนี้ ยอดขายเดือนนี้จะประมาณ ${baht(fc)}${vsTarget !== null ? ` (${vsTarget}% ของเป้า)` : vsLast !== null ? ` (เทียบเดือนก่อน ${sgn(vsLast)})` : ""}`,
    en: `At this pace the month ends near ${baht(fc)}${vsTarget !== null ? ` (${vsTarget}% of target)` : vsLast !== null ? ` (${sgn(vsLast)} vs last month)` : ""}.`,
  }[lang];
  const note = perDay
    ? {
        ko: `남은 ${left}일 동안 하루 ${baht(perDay)}이면 목표 달성 (지금 평균 ${baht(Math.round(p.sales / p.daysDone))})`,
        ja: `残り${left}日、1日${baht(perDay)}で目標達成（今の平均 ${baht(Math.round(p.sales / p.daysDone))}）`,
        th: `อีก ${left} วัน ขายวันละ ${baht(perDay)} จะถึงเป้า (เฉลี่ยตอนนี้ ${baht(Math.round(p.sales / p.daysDone))})`,
        en: `${baht(perDay)} a day for the last ${left} days reaches the target (now ${baht(Math.round(p.sales / p.daysDone))} a day)`,
      }[lang]
    : undefined;
  return { title: T.forecast[lang], main, note };
}

/** No sales kept: where this month's purchases went */
export function costTip(top: { name: string; share: number } | null, lang: LineLang): CardTip | null {
  if (!top || top.share <= 0) return null;
  const p = Math.round(top.share * 100);
  return {
    title: T.costs[lang],
    main: { ko: `이번 달 매입의 ${p}%가 ${top.name}이에요.`, ja: `今月の仕入の${p}%が${top.name}です。`, th: `${p}% ของยอดซื้อเดือนนี้คือ ${top.name}`, en: `${p}% of this month's purchases are ${top.name}.` }[lang],
  };
}

/** Bills due within a week against what the shop took in the last 7 days */
export function cashTip(p: { dueTotal: number; overdue: number; overdueTotal: number; last7Sales: number | null }, lang: LineLang): CardTip | null {
  if (p.overdue > 0)
    return {
      title: T.cash[lang],
      main: {
        ko: `기한 지난 ${p.overdue}건 ${baht(p.overdueTotal)}부터 정리하세요.`,
        ja: `期限切れの${p.overdue}件 ${baht(p.overdueTotal)}を先に支払いましょう。`,
        th: `จ่ายบิลที่เลยกำหนด ${p.overdue} ใบ ${baht(p.overdueTotal)} ก่อน`,
        en: `Settle the ${p.overdue} overdue bill(s), ${baht(p.overdueTotal)}, first.`,
      }[lang],
      note: { ko: "늦으면 거래처 신뢰와 할인 조건에 영향이 있어요.", ja: "遅れると取引先の信頼や条件に響きます。", th: "จ่ายช้าอาจกระทบความเชื่อใจของคู่ค้า", en: "Late payments can cost goodwill and terms." }[lang],
    };
  if (p.dueTotal <= 0 || p.last7Sales === null) return null;
  const ok = p.last7Sales >= p.dueTotal;
  return {
    title: T.cash[lang],
    main: {
      ko: `이번 주 낼 돈 ${baht(p.dueTotal)} · 최근 7일 매출 ${baht(p.last7Sales)} — ${ok ? "충분해요" : "부족할 수 있어요"}.`,
      ja: `今週の支払い ${baht(p.dueTotal)} · 直近7日の売上 ${baht(p.last7Sales)} — ${ok ? "足ります" : "足りない可能性があります"}。`,
      th: `ต้องจ่าย ${baht(p.dueTotal)} · ยอดขาย 7 วันล่าสุด ${baht(p.last7Sales)} — ${ok ? "เพียงพอ" : "อาจไม่พอ"}`,
      en: `Due this week ${baht(p.dueTotal)} · last 7 days' sales ${baht(p.last7Sales)} — ${ok ? "enough" : "may be short"}.`,
    }[lang],
  };
}

/** Purchases of the VAT month whose VAT cannot be claimed (no full tax invoice, not to us …) */
export function claimTip(p: { lostCount: number; lostVat: number; toCheck: number }, lang: LineLang): CardTip {
  if (p.lostCount > 0)
    return {
      title: T.claim[lang],
      main: {
        ko: `공제가 안 되는 영수증 ${p.lostCount}장 (부가세 ${baht(p.lostVat)})이 있어요.`,
        ja: `控除できない領収書が${p.lostCount}件（VAT ${baht(p.lostVat)}）あります。`,
        th: `มีใบเสร็จที่ขอคืนภาษีไม่ได้ ${p.lostCount} ใบ (VAT ${baht(p.lostVat)})`,
        en: `${p.lostCount} receipt(s) with ${baht(p.lostVat)} VAT can't be claimed.`,
      }[lang],
      note: {
        ko: "자주 가는 거래처에 정식 세금계산서(회사 이름 · 세금번호)를 요청하면 다음 달부터 공제돼요.",
        ja: "よく使う取引先に正式なタックスインボイス（会社名・税番号入り）を頼むと、来月から控除できます。",
        th: "ขอใบกำกับภาษีเต็มรูป (ชื่อและเลขผู้เสียภาษีบริษัท) จากร้านที่ซื้อบ่อย เพื่อขอคืนได้ตั้งแต่เดือนหน้า",
        en: "Ask regular suppliers for full tax invoices (our name and tax ID) to claim it from next month.",
      }[lang],
    };
  return {
    title: T.ready[lang],
    main:
      p.toCheck > 0
        ? { ko: `확인할 영수증 ${p.toCheck}장만 정리하면 신고 준비 끝이에요.`, ja: `確認が必要な${p.toCheck}件を整理すれば申告準備は完了です。`, th: `ตรวจใบเสร็จอีก ${p.toCheck} ใบ ก็พร้อมยื่นแล้ว`, en: `Clear the ${p.toCheck} receipt(s) to check and you're ready to file.` }[lang]
        : { ko: "공제 못 받는 영수증이 없어요. 신고 준비가 됐어요.", ja: "控除できない領収書はありません。申告の準備ができています。", th: "ไม่มีใบเสร็จที่เสียสิทธิ์ พร้อมยื่นแล้ว", en: "Every receipt is claimable — ready to file." }[lang],
  };
}

/** Yesterday against the same weekday of the last 4 weeks */
export function weekdayTip(p: { date: string; total: number; usual: number | null }, lang: LineLang): CardTip | null {
  if (!p.usual || p.total <= 0) return null;
  const d = WD[lang][new Date(`${p.date}T00:00:00Z`).getUTCDay()];
  const ch = ((p.total - p.usual) / p.usual) * 100;
  return {
    title: T.pattern[lang],
    main: {
      ko: `평소 ${d}요일 평균 ${baht(p.usual)}보다 ${sgn(ch)}예요.`,
      ja: `いつもの${d}曜日（平均 ${baht(p.usual)}）より ${sgn(ch)} です。`,
      th: `เทียบกับวัน${d} ปกติ (เฉลี่ย ${baht(p.usual)}) ${sgn(ch)}`,
      en: `${sgn(ch)} vs a usual ${d} (average ${baht(p.usual)}).`,
    }[lang],
  };
}

export const excelTip = (lang: LineLang): CardTip => ({
  title: T.excel[lang],
  main: {
    ko: "이 링크를 그대로 회계사에게 전달하면 돼요. 1시간 뒤에는 열리지 않아요.",
    ja: "このリンクをそのまま会計士に送れます。1時間後には開けなくなります。",
    th: "ส่งลิงก์นี้ให้นักบัญชีได้เลย ลิงก์จะหมดอายุใน 1 ชั่วโมง",
    en: "Forward this link to your accountant as it is; it stops working after an hour.",
  }[lang],
});
