"use client";

// PDF documents (e.g. Thai e-Tax Invoices sent by e-mail). The AI reads the PDF itself (its text layer is exact);
// this turns its pages into one JPEG for everything that shows a picture: the preview, the stored "photo" and
// its thumbnail. Pages are stacked top to bottom (at most MAX_PDF_PAGES), about PDF_WIDTH px wide.
// pdf.js runs its worker from /public/pdfjs (copied from node_modules/pdfjs-dist — see pdf-render.test.ts).

export const MAX_PDF_PAGES = 4;
const PDF_WIDTH = 1600;

export const isPdf = (f: { type: string; name: string }) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export async function pdfToJpeg(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  });
  try {
    const pdf = await task.promise;
    const pages: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_WIDTH / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(canvas);
    }
    const out = document.createElement("canvas");
    out.width = Math.max(...pages.map((c) => c.width));
    out.height = pages.reduce((h, c) => h + c.height, 0);
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of pages) {
      ctx.drawImage(c, 0, y);
      y += c.height;
    }
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.88));
    if (!blob) throw new Error("no jpeg");
    return new File([blob], file.name.replace(/\.pdf$/i, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    await task.destroy();
  }
}
