"use client";

// One document = one printed A4 page, using the whole page width. The printable width (~700px) would switch
// the form to its narrow, stacked layout and push it onto 2–3 pages (cutting through the signatures), so for
// printing the form is laid out wider and scaled down to the page. The form is tall (three languages per
// label), so it is laid out wider and wider — each step shorter — until at full page width it also fits the
// height. The text size stays about the same (~50%) whichever width fits; only the empty side margin goes.
// A form so long (many items) that one page would make the text unreadable prints at full width over pages.

import { type RefObject, useEffect } from "react";

const MM = 96 / 25.4;
// A4 portrait minus the 12mm margins of @page in globals.css
const PAGE_W = (210 - 24) * MM;
const PAGE_H = (297 - 24) * MM;
/** Room kept free at the bottom: print rounding must never spill a line onto a second page */
const PAGE_H_SAFE = PAGE_H * 0.97;
/** Narrowest layout width used for printing (the two-column desktop layout) */
export const PRINT_LAYOUT_W = 860;
const STEP = 40;
/** Smallest scale still readable on paper (a typical one-item invoice needs ~0.5) */
const MIN_ZOOM = 0.45;
/** Widest layout tried: it prints at MIN_ZOOM */
const WIDEST = PAGE_W / MIN_ZOOM;

/** Fit the element onto one page while the browser prints (window.print, Ctrl+P, the print menu) */
export function usePrintFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      // beforeprint still runs with screen styles: .print-fit (globals.css) hides the screen-only parts
      // (print:hidden) and the paper's padding so the height measured here is the printed height
      document.documentElement.classList.add("print-fit");
      // Measured as it will print: the zoom changes the form's own width, and with it its layout
      // (container queries), so the height is read with the zoom already applied.
      const printedHeight = (width: number, zoom: number) => {
        el.style.width = `${width}px`;
        el.style.zoom = String(zoom);
        return el.getBoundingClientRect().height;
      };
      // Full page width, laid out wider and wider (a wider layout is shorter) until it fits the height
      for (let width = PRINT_LAYOUT_W; width <= WIDEST; width += STEP) {
        const zoom = PAGE_W / width;
        if (printedHeight(width, zoom) <= PAGE_H_SAFE) return;
      }
      // Too long for one readable page: the normal layout at full width, over several pages
      printedHeight(PRINT_LAYOUT_W, PAGE_W / PRINT_LAYOUT_W);
    };
    const reset = () => {
      document.documentElement.classList.remove("print-fit");
      const el = ref.current;
      if (!el) return;
      el.style.width = "";
      el.style.zoom = "";
    };
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
    };
  }, [ref]);
}
