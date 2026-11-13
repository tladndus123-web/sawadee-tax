// Draws the admins' LINE menu pictures (docs/line-menu/{ko,ja,th,en}.png) in the app icon's style: white paper, the
// icon's blue (#3b8bff → #0a5ce6), the S receipt mark. Owner 2026-11-14: "아이콘과 잘 어울리고, 적당한 크기".
// Layout = lib/line-menu.ts CELLS (2500 × 1250): wide summary · due · VAT / sales · Excel · wide upload.
//
//   node scripts/line-menu-art.mjs            (then: npx.cmd tsx scripts/line-menu.ts uploads them to LINE)
//
// Needs Microsoft Edge (Playwright channel msedge) and the Windows fonts Malgun Gothic / Yu Gothic / Leelawadee UI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 2500;
const H = 1250;
const OUT = path.join(__dirname, "..", "docs", "line-menu");

const TEXT = {
  ko: { font: "'Malgun Gothic'", summary: ["이번 달 요약", "매출 · 지출 한눈에"], due: "이번 주 낼 돈", vat: "부가세 마감", sales: "어제 매출", excel: "엑셀 받기", upload: ["영수증 올리기", "사진 한 장이면 장부 끝"] },
  ja: { font: "'Yu Gothic UI','Yu Gothic','Meiryo'", summary: ["今月のまとめ", "売上・支出をひと目で"], due: "今週の支払い", vat: "VAT申告期限", sales: "昨日の売上", excel: "Excel出力", upload: ["領収書を送る", "写真1枚で帳簿が完成"] },
  th: { small: 60, font: "'Leelawadee UI','Tahoma'", summary: ["สรุปเดือนนี้", "ยอดขาย · รายจ่าย ในหน้าเดียว"], due: "ต้องจ่ายสัปดาห์นี้", vat: "กำหนดยื่น VAT", sales: "ยอดขายเมื่อวาน", excel: "ดาวน์โหลด Excel", upload: ["ส่งใบเสร็จ", "ถ่ายรูปเดียว บัญชีเสร็จ"] },
  en: { small: 64, font: "'Segoe UI'", summary: ["Monthly summary", "Sales & costs at a glance"], due: "Due this week", vat: "VAT deadline", sales: "Yesterday's sales", excel: "Download Excel", upload: ["Upload receipt", "One photo, books done"] },
};

// Lucide-style line icons (24 × 24)
const ICON = {
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6M9 15l3 3 3-3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
};
const svg = (name, color, size, stroke = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const MARK = fs.readFileSync(path.join(__dirname, "..", "public", "app-mark.svg"), "utf8").replace(/<!--[\s\S]*?-->/g, "").replace("<svg ", '<svg width="120" height="120" ');

function page(t) {
  const small = (eyebrow, title, icon, tint, color) => `
    <div class="card small">
      <div class="top"><span class="eyebrow" style="color:${color}">${eyebrow}</span><span class="go">${svg("arrow", "#8590a3", 40, 2.4)}</span></div>
      <div class="icon" style="background:${tint}">${svg(icon, color, 78, 2.2)}</div>
      <div class="title">${title}</div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { --t: ${t.small || 72}px; width: ${W}px; height: ${H}px; background: #eaf0f9; font-family: ${t.font}, 'Segoe UI', sans-serif; color: #15203a; }
    .grid { display: grid; grid-template-columns: repeat(4, 625px); grid-template-rows: 625px 625px; width: ${W}px; height: ${H}px; }
    .cell { padding: 22px; }
    .wide { grid-column: span 2; }
    .card { width: 100%; height: 100%; border-radius: 56px; position: relative; overflow: hidden; }
    .small { background: #fff; border: 3px solid #dfe7f3; padding: 56px 52px; display: flex; flex-direction: column; }
    .top { display: flex; justify-content: space-between; align-items: center; }
    .eyebrow { font: 800 38px 'Segoe UI', sans-serif; letter-spacing: 6px; }
    .go { width: 76px; height: 76px; border-radius: 50%; border: 3px solid #e3e9f2; display: grid; place-items: center; }
    .icon { width: 132px; height: 132px; border-radius: 36px; display: grid; place-items: center; margin-top: 46px; }
    .title { margin-top: auto; font-weight: 800; font-size: var(--t, 72px); line-height: 1.15; letter-spacing: -1px; }
    .summary { background: linear-gradient(135deg, #3b8bff, #0a5ce6); color: #fff; padding: 60px 64px; }
    .summary .eyebrow { color: #dce8ff; }
    .summary .mark { position: absolute; right: 64px; top: 52px; filter: drop-shadow(0 10px 24px #0004); }
    .summary .mark svg rect { fill: #fff2; }
    .summary .big { position: absolute; left: 64px; bottom: 64px; }
    .summary .big .title { font-size: 92px; color: #fff; }
    .summary .sub { font-size: 40px; color: #dce8ff; margin-top: 18px; font-weight: 600; }
    .bars { position: absolute; right: 64px; bottom: 64px; display: flex; gap: 22px; align-items: flex-end; height: 300px; }
    .bars i { width: 50px; border-radius: 16px; background: #ffffff40; display: block; }
    .bars i:last-child { background: #fff; }
    .upload { background: #fff; border: 3px solid #dfe7f3; padding: 60px 64px; }
    .upload .eyebrow { color: #0a5ce6; }
    .upload .big { position: absolute; left: 64px; bottom: 74px; }
    .upload .big .title { font-size: 92px; }
    .upload .sub { font-size: 40px; color: #4d5869; margin-top: 18px; font-weight: 600; }
    .shot { position: absolute; right: 70px; top: 50%; transform: translateY(-46%); width: 290px; height: 290px; border-radius: 50%;
            background: linear-gradient(135deg, #3b8bff, #0a5ce6); display: grid; place-items: center; box-shadow: 0 24px 50px #0a5ce640; }
    .zig { position: absolute; left: 0; right: 0; bottom: 0; height: 26px;
           background: linear-gradient(135deg, #eaf0f9 25%, transparent 25%) -26px 0/52px 52px, linear-gradient(225deg, #eaf0f9 25%, transparent 25%) -26px 0/52px 52px; }
  </style></head><body><div class="grid">
    <div class="cell wide"><div class="card summary">
      <span class="eyebrow">MONTHLY</span>
      <div class="mark">${MARK}</div>
      <div class="bars"><i style="height:110px"></i><i style="height:170px"></i><i style="height:135px"></i><i style="height:215px"></i><i style="height:185px"></i><i style="height:280px"></i></div>
      <div class="big"><div class="title">${t.summary[0]}</div><div class="sub">${t.summary[1]}</div></div>
    </div></div>
    <div class="cell">${small("WEEK", t.due, "wallet", "#e8f0ff", "#0a5ce6")}</div>
    <div class="cell">${small("VAT", t.vat, "calendar", "#fff0e6", "#e0580c")}</div>
    <div class="cell">${small("SALES", t.sales, "trend", "#e8f0ff", "#0a5ce6")}</div>
    <div class="cell">${small("EXCEL", t.excel, "file", "#e7f6ee", "#14945a")}</div>
    <div class="cell wide"><div class="card upload">
      <span class="eyebrow">UPLOAD</span>
      <div class="shot">${svg("camera", "#fff", 130, 2)}</div>
      <div class="big"><div class="title">${t.upload[0]}</div><div class="sub">${t.upload[1]}</div></div>
      <div class="zig"></div>
    </div></div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const [lang, t] of Object.entries(TEXT)) {
    await p.setContent(page(t), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const file = path.join(OUT, `${lang}.png`);
    await p.screenshot({ path: file, type: "png" });
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`${lang}.png ${kb} KB`);
    if (kb > 1000) throw new Error(`${lang}.png is over 1 MB`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
