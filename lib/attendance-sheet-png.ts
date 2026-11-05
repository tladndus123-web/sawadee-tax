"use client";

// One PNG per PDF page. pdf.js draws the real file, so the picture matches the PDF. The scale stays
// under PNG_MAX_EDGE because a phone canvas quietly crops anything larger.

import { PNG_MAX_EDGE, pngScaleFor } from "./attendance-share";

export async function pdfToPngPages(pdf: Uint8Array, maxEdge = PNG_MAX_EDGE): Promise<Blob[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise;
    const pages: Blob[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pngScaleFor(base.width, base.height, maxEdge) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no png");
      pages.push(blob);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
