// Attendance sheet as a real PDF (vector text, one page per slice of the grid). Fonts are the open-source
// Noto faces in public/fonts/attendance (SIL Open Font License): Noto Sans, Noto Sans Thai, Noto Sans KR
// and Noto Sans JP. fontkit subsets each face to the glyphs this sheet actually uses. Loaded only when
// someone saves or shares — see loadSheetFonts.

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
// fontkit 2 ships no types. It subsets Noto to the glyphs this sheet uses.
// @ts-expect-error no declaration file
import { create } from "fontkit";

interface GlyphFont {
  glyphForCodePoint(codePoint: number): { id: number };
}
import { placeSheet, SHEET_PAGE, type AttendanceSheet, type AttendanceSheetLabels, type SheetBlock, type SheetGlyph } from "./attendance-sheet";

export interface SheetFontBytes {
  latin: Uint8Array;
  thai: Uint8Array;
  kr: Uint8Array;
  jp: Uint8Array;
}

type Face = keyof SheetFontBytes;

const ORDER: Record<string, Face[]> = {
  thai: ["thai", "latin", "jp", "kr"],
  hangul: ["kr", "jp", "latin", "thai"],
  kana: ["jp", "kr", "latin", "thai"],
  cjk: ["jp", "kr", "latin", "thai"],
  latin: ["latin", "kr", "jp", "thai"],
};

function scriptOf(code: number): keyof typeof ORDER {
  if (code >= 0x0e00 && code <= 0x0e7f) return "thai";
  if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f) || (code >= 0xac00 && code <= 0xd7af)) return "hangul";
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff) || (code >= 0xff65 && code <= 0xff9f)) return "kana";
  if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) return "cjk";
  return "latin";
}

function supports(font: GlyphFont, code: number): boolean {
  try {
    return font.glyphForCodePoint(code).id !== 0;
  } catch {
    return false;
  }
}

function runs(text: string, faces: Record<Face, GlyphFont>): { face: Face; text: string }[] {
  const out: { face: Face; text: string }[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const face = ORDER[scriptOf(code)].find((name) => supports(faces[name], code));
    if (!face) continue;
    const last = out[out.length - 1];
    if (last?.face === face) last.text += ch;
    else out.push({ face, text: ch });
  }
  return out;
}

function colorOf(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Top-left layout y → PDF baseline. */
function baseline(top: number, size: number): number {
  return SHEET_PAGE.height - top - size * 0.8;
}

async function openFonts(fonts: SheetFontBytes): Promise<{ measure: (text: string, size: number) => number; doc: PDFDocument; embedded: Record<Face, PDFFont>; faces: Record<Face, GlyphFont> }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit({ create });
  const faces: Record<Face, GlyphFont> = {
    latin: create(fonts.latin),
    thai: create(fonts.thai),
    kr: create(fonts.kr),
    jp: create(fonts.jp),
  };
  const embedded: Record<Face, PDFFont> = {
    latin: await doc.embedFont(fonts.latin, { subset: true }),
    thai: await doc.embedFont(fonts.thai, { subset: true }),
    kr: await doc.embedFont(fonts.kr, { subset: true }),
    jp: await doc.embedFont(fonts.jp, { subset: true }),
  };
  const measure = (text: string, size: number) => runs(text, faces).reduce((sum, run) => sum + embedded[run.face].widthOfTextAtSize(run.text, size), 0);
  return { measure, doc, embedded, faces };
}

/** Real glyph widths, for the overflow checks. */
export async function measureWithSheetFonts(fonts: SheetFontBytes): Promise<(text: string, size: number) => number> {
  return (await openFonts(fonts)).measure;
}

export async function buildAttendancePdf(sheet: AttendanceSheet, labels: AttendanceSheetLabels, fonts: SheetFontBytes): Promise<Uint8Array> {
  const { doc, measure, embedded, faces } = await openFonts(fonts);
  const placed = placeSheet(sheet, labels, measure);
  const pages: PDFPage[] = [];
  for (let i = 0; i < placed.pageCount; i++) pages.push(doc.addPage([SHEET_PAGE.width, SHEET_PAGE.height]));

  const paint = (block: SheetBlock) => {
    pages[block.page]?.drawRectangle({
      x: block.x,
      y: SHEET_PAGE.height - block.y - block.h,
      width: Math.max(0, block.w),
      height: Math.max(0, block.h),
      color: colorOf(block.fill),
    });
  };
  for (const block of placed.blocks) paint(block);
  for (const rule of placed.rules) {
    pages[rule.page]?.drawLine({
      start: { x: rule.x, y: SHEET_PAGE.height - rule.y },
      end: { x: rule.x + rule.w, y: SHEET_PAGE.height - rule.y },
      thickness: 0.7,
      color: colorOf(rule.color),
    });
  }
  for (const glyph of placed.glyphs) drawGlyph(pages[glyph.page], glyph, embedded, faces);

  doc.setTitle(`${labels.title} ${sheet.month}`.trim());
  doc.setCreator("Sawadee TAX");
  doc.setProducer("Sawadee TAX");
  return doc.save();
}

function drawGlyph(page: PDFPage | undefined, glyph: SheetGlyph, embedded: Record<Face, PDFFont>, faces: Record<Face, GlyphFont>) {
  if (!page) return;
  let x = glyph.x;
  const y = baseline(glyph.y, glyph.size);
  for (const run of runs(glyph.text, faces)) {
    page.drawText(run.text, { x, y, size: glyph.size, font: embedded[run.face], color: colorOf(glyph.color) });
    x += embedded[run.face].widthOfTextAtSize(run.text, glyph.size);
  }
}

const FONT_FILES: Record<Face, string> = {
  latin: "NotoSans-Regular.ttf",
  thai: "NotoSansThai-Regular.ttf",
  kr: "NotoSansKR-Regular.woff",
  jp: "NotoSansJP-Regular.woff",
};

let fontPromise: Promise<SheetFontBytes> | null = null;

/** Same-origin font files. The first share downloads them; the browser keeps them after that. */
export function loadSheetFonts(): Promise<SheetFontBytes> {
  fontPromise ??= (async () => {
    try {
      const out = {} as SheetFontBytes;
      for (const [key, name] of Object.entries(FONT_FILES) as [Face, string][]) {
        const res = await fetch(`/fonts/attendance/${name}`);
        if (!res.ok) throw new Error("font");
        out[key] = new Uint8Array(await res.arrayBuffer());
      }
      return out;
    } catch (error) {
      fontPromise = null;
      throw error;
    }
  })();
  return fontPromise;
}
