"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Mouse-wheel / trackpad scrolling eased like macOS (Lenis). Only with a mouse or trackpad: phones already
 * scroll natively with momentum. Off when the device asks for reduced motion. Menus, dialogs and scrollable
 * lists keep their own scrolling, and the page stands still while a dialog is open.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      prevent: (node) => !!node.closest("[data-lenis-prevent], [role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu'], [data-radix-popper-content-wrapper]"),
    });
    // Radix marks the body while a dialog or menu locks the page
    const sync = () => (document.body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start());
    const watch = new MutationObserver(sync);
    watch.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => {
      watch.disconnect();
      lenis.destroy();
    };
  }, []);
  return null;
}
