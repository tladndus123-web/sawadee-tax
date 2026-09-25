"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/** Page background per theme (globals.css): the phone's status bar / browser bar matches the app, not the OS */
const COLORS = { light: "#f5f5f7", dark: "#000000" } as const;

export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = resolvedTheme === "dark" ? COLORS.dark : COLORS.light;
    // Replace the per-OS-scheme tags from the server with one that follows the picked theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    document.head.appendChild(meta);
  }, [resolvedTheme]);
  return null;
}
