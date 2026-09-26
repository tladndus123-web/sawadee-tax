"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Mouse-wheel / trackpad scrolling eased like macOS (Lenis). Only with a mouse or trackpad: phones already
 * scroll natively with momentum. Off when the device asks for reduced motion.
 *
 * While a menu or dialog is open (Radix marks the body with data-scroll-locked) Lenis simply leaves the wheel
 * alone. It is never stopped: lenis.stop() puts overflow:hidden on <html>, which moved open menus out of view
 * on a scrolled page and made the theme / language menus unusable.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      prevent: (node) =>
        document.body.hasAttribute("data-scroll-locked") ||
        !!node.closest("[data-lenis-prevent], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], [data-radix-popper-content-wrapper]"),
    });
    return () => lenis.destroy();
  }, []);
  return null;
}
