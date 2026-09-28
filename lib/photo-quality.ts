// Photo check before the AI reads a document: too dark, blurry or too small photos are misread (and still
// cost a reading), so the person is asked to retake them first — they can still send it as it is.
// The measuring is done on a grey copy about 1000 px wide: sharpness = how strongly the brightness jumps
// between neighbouring pixels at the text edges (Laplacian), brightness = the average grey level.

import { isSlip } from "./slip-tiles";

export type PhotoIssue = "dark" | "blurry" | "small" | "duplicate";

/** Width the photo is measured at (text strokes are a few pixels wide here) */
export const MEASURE_W = 1000;
/** Average grey (0–255) below which the paper looks dark */
export const DARK_BELOW = 70;
/** Edge strength (see sharpness()) below which the text is soft */
export const BLURRY_BELOW = 20;
/** Shortest side (px) below which small print can't be read */
export const SMALL_BELOW = 700;
/** Same, for a long narrow slip: its width only has to hold one short column of print */
export const SLIP_SMALL_BELOW = 450;

/** Mean grey level 0–255 */
export function brightness(gray: Uint8ClampedArray | number[]): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return gray.length ? sum / gray.length : 0;
}

/**
 * Edge strength: the 99th percentile of |Laplacian| over the image. A percentile, not the average, so a
 * sharp receipt with lots of blank paper still counts as sharp (only its text edges need to be crisp).
 */
export function sharpness(gray: Uint8ClampedArray | number[], w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  const counts = new Uint32Array(1021);
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]);
      counts[Math.min(1020, Math.round(lap))]++;
      n++;
    }
  }
  let seen = 0;
  const target = n * 0.99;
  for (let v = 0; v < counts.length; v++) {
    seen += counts[v];
    if (seen >= target) return v;
  }
  return 1020;
}

/** What is wrong with the photo, from its measurements (empty = fine) */
export function photoIssues(m: { brightness: number; sharpness: number; width: number; height: number }): PhotoIssue[] {
  const issues: PhotoIssue[] = [];
  if (m.brightness < DARK_BELOW) issues.push("dark");
  if (m.sharpness < BLURRY_BELOW) issues.push("blurry");
  const limit = isSlip(m.width, m.height) ? SLIP_SMALL_BELOW : SMALL_BELOW;
  if (Math.min(m.width, m.height) < limit) issues.push("small");
  return issues;
}

/** Measure a prepared JPEG in the browser. Never throws: a photo that can't be measured is let through. */
export async function checkPhoto(photo: Blob): Promise<PhotoIssue[]> {
  try {
    const bmp = await createImageBitmap(photo);
    const scale = Math.min(1, MEASURE_W / bmp.width);
    const w = Math.max(3, Math.round(bmp.width * scale));
    const h = Math.max(3, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(bmp, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    const issues = photoIssues({ brightness: brightness(gray), sharpness: sharpness(gray, w, h), width: bmp.width, height: bmp.height });
    bmp.close();
    return issues;
  } catch {
    return [];
  }
}
