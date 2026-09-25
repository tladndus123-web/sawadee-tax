"use client";

// One document = one printed A4 page. The printable width (~700px) would switch the form to its narrow,
// stacked layout and push it onto 2–3 pages (cutting through the signatures), so for printing the form
// is laid out at the desktop width and scaled down until it fits the page both ways.

import { type RefObject, useEffect } from "react";

const MM = 96 / 25.4;
// A4 portrait minus the 12mm margins of @page in globals.css
const PAGE_W = (210 - 24) * MM;
const PAGE_H = (297 - 24) * MM;
/** Width the form is laid out at when printing (the two-column desktop layout) */
export const PRINT_LAYOUT_W = 860;

/** Fit the element onto one page while the browser prints (window.print, Ctrl+P, the print menu) */
export function usePrintFit(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      // beforeprint still runs with screen styles: .print-fit (globals.css) hides the screen-only parts
      // (print:hidden) and the paper's padding so the height measured here is the printed height
      document.documentElement.classList.add("print-fit");
      el.style.width = `${PRINT_LAYOUT_W}px`;
      const z = Math.min(PAGE_W / PRINT_LAYOUT_W, (PAGE_H - 8) / el.scrollHeight);
      el.style.zoom = z.toFixed(4);
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
