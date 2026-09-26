"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

/** Page background per theme (globals.css): the phone's status bar / browser bar matches the app, not the OS */
const COLORS = { light: "#eaecf0", dark: "#000000" } as const;

const noop = () => () => {};

/**
 * The only theme-color tag (the root layout's viewport sets none). Rendered by React — React 19 hoists
 * <meta> into <head> — so it is updated, never removed by hand: removing tags React owns broke client-side
 * navigation ("Cannot read properties of null (reading 'removeChild')"), turning every other tap into a full reload.
 * Rendered only in the browser: a server-rendered tag with the other colour would stay next to it.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  if (!inBrowser) return null;
  return <meta name="theme-color" content={resolvedTheme === "dark" ? COLORS.dark : COLORS.light} />;
}
