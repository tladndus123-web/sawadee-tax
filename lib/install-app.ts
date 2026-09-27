"use client";

// "Install as an app" (home screen). Android Chrome hands out a one-time install prompt early, before any screen
// asks for it — so it is caught here, as soon as this module loads, and kept for the button.
// iPhone Safari has no prompt: people add it from the Share menu, so the screen shows those steps instead.

import { useSyncExternalStore } from "react";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export type InstallState = "installed" | "prompt" | "ios" | "manual" | "server";

function current(): InstallState {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (installed || standalone) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch tells them apart
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "manual";
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => "server",
  );
}

/** Android / desktop Chrome: show the browser's own install dialog. True when the person said yes. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const p = deferred;
  deferred = null;
  await p.prompt();
  const { outcome } = await p.userChoice;
  notify();
  return outcome === "accepted";
}
