"use client";

import { useEffect } from "react";

/**
 * Paper is white: while the browser prints (Ctrl+P, the print menu, "Save as PDF"), the page switches to the
 * light theme, then back. Without this a dark-mode user prints dark boxes with light text.
 */
export function PrintLight() {
  useEffect(() => {
    const html = document.documentElement;
    // "Before" can arrive twice (e.g. Save as PDF while a print is being prepared): only the first one
    // remembers the theme, only the matching "after" puts it back
    let printing = false;
    let wasDark = false;
    let scheme = "";
    const before = () => {
      if (printing) return;
      printing = true;
      wasDark = html.classList.contains("dark");
      scheme = html.style.colorScheme;
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    };
    const after = () => {
      if (!printing) return;
      printing = false;
      if (wasDark) html.classList.add("dark");
      html.style.colorScheme = scheme;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
