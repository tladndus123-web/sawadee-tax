// Several receipts in one photo (owner's choice 2026-09-28, "B"): a small, cheap model only finds where each
// document is; each one is then cut out at full resolution and read like any other photo, so accuracy stays the
// same. This file is the pure part: cleaning the boxes the model returns. Fractions 0–1 of the image.

export const MAX_PER_PHOTO = 6;
/** Extra room around each box: the finder's boxes are approximate and a cut-off total is worse than a bit of the neighbour */
export const MARGIN = 0.035;

export type Box = [x: number, y: number, w: number, h: number];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Valid, enlarged by the margin, clipped to the image; tiny specks and near-duplicates dropped */
export function cleanBoxes(raw: unknown): Box[] {
  const list = Array.isArray(raw) ? raw : [];
  const boxes: Box[] = [];
  for (const item of list) {
    const b = Array.isArray(item) ? item : (item as { box?: unknown } | null)?.box;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    let [x, y, w, h] = b as number[];
    // Some replies use 0–1000 instead of fractions
    if ([x, y, w, h].some((n) => n > 1.5)) [x, y, w, h] = [x / 1000, y / 1000, w / 1000, h / 1000];
    if (w <= 0 || h <= 0 || w * h < 0.004) continue;
    const x0 = clamp(x - MARGIN);
    const y0 = clamp(y - MARGIN);
    const x1 = clamp(x + w + MARGIN);
    const y1 = clamp(y + h + MARGIN);
    const box: Box = [x0, y0, x1 - x0, y1 - y0];
    if (boxes.some((o) => overlap(o, box) > 0.7)) continue;
    boxes.push(box);
  }
  return readingOrder(boxes);
}

/** Share of the smaller box covered by the other */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a[2] * a[3], b[2] * b[3]);
}

/** Rows top to bottom, left to right within a row (boxes whose centres are close in height share a row) */
export function readingOrder(boxes: Box[]): Box[] {
  const cy = (b: Box) => b[1] + b[3] / 2;
  const sorted = [...boxes].sort((a, b) => cy(a) - cy(b));
  const rows: Box[][] = [];
  for (const b of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(cy(row[0]) - cy(b)) < Math.min(row[0][3], b[3]) / 2) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a[0] - b[0]));
}

/** Pixel rectangle of a box on an image of the given size */
export function toPixels(b: Box, width: number, height: number) {
  const left = Math.round(b[0] * width);
  const top = Math.round(b[1] * height);
  return { left, top, width: Math.max(1, Math.min(width - left, Math.round(b[2] * width))), height: Math.max(1, Math.min(height - top, Math.round(b[3] * height))) };
}
