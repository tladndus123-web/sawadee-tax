"use client";

// The top-bar AI button and the assistant's mark, kept apart from the panel (components/assistant/AssistantPanel) so the
// header does not pull the whole panel into every page's first download (speed, 2026-11-09). The panel loads right
// after the page (AssistantPanelLazy); a tap before it is there is remembered and opens it as soon as it mounts.

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/role-store";
import { fullAdmin } from "@/lib/screens";

export const OPEN_EVENT = "assistant-open";
/** Set when the button is tapped; the panel reads and clears it when it mounts */
export const OPEN_WANTED = "__sawadeeAiOpen";

/** The assistant's mark (public/ai-mark.svg): the app logo's family, a talking face with a sparkle */
export function AiMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG
  return <img src="/ai-mark.svg" alt="" aria-hidden="true" draggable={false} className={className} />;
}

/** Top bar button, PC and phones (2026-11-09 mobile check: the floating phone button covered save bars and rows) */
export function AssistantButton() {
  const t = useTranslations("aiPanel");
  // It reads the whole books: not for an admin an owner limited (lib/screens fullAdmin)
  const isAdmin = fullAdmin(useMe());
  if (!isAdmin) return null;
  return (
    // Just the mark, like the app logo (owner 2026-10-27: the wider pill squeezed the top bar); the name is the tooltip
    <button
      type="button"
      onClick={() => {
        (window as unknown as Record<string, boolean>)[OPEN_WANTED] = true;
        window.dispatchEvent(new Event(OPEN_EVENT));
      }}
      className="press relative grid size-9 flex-none place-items-center rounded-[10px] transition-transform after:absolute after:-inset-1 hover:scale-105 active:scale-[0.95]"
      aria-label={t("open")}
      title={`${t("title")} (Ctrl+K)`}
    >
      <AiMark className="size-9 rounded-[10px] [filter:drop-shadow(0_2px_6px_rgb(4_60_190/0.28))]" />
    </button>
  );
}
