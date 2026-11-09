"use client";

// The AI panel (admins) is not part of a page's first download (speed, 2026-11-09): it loads right after the page
// shows. The top-bar button and Ctrl+K reach it through a window event, and it mounts within a moment.
import dynamic from "next/dynamic";

export const AssistantPanelLazy = dynamic(() => import("./AssistantPanel").then((m) => m.AssistantPanel), { ssr: false });
