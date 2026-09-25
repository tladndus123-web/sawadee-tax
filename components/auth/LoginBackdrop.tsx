"use client";

// Login background: a calm light from the top and a few accounting symbols in soft tiles around the card.
// Now and then one symbol plays a small SF Symbols-style effect (bounce, draw-on, grow…), one at a time,
// so the page feels alive without anything constantly moving. CSS in app/globals.css ("Login symbols").
// Tiles are hidden on phones (the card fills the screen); no effects when the device asks for reduced motion.
import { BadgeCheck, CalendarCheck, Calculator, ChartColumnIncreasing, Coins, FileSpreadsheet, ReceiptText, ScanLine, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

type Sym = {
  Icon: LucideIcon;
  /** Which effect it plays (see .sym[data-fx] in globals.css) */
  fx: "write" | "grow" | "press" | "bounce" | "seal" | "check" | "scan" | "cells";
  /** Offset of the tile centre from the screen centre (px) */
  x: number;
  /** Height on the screen (%) */
  y: number;
};

// Left: reading receipts and adding them up. Right: checking, dates, export.
const SYMBOLS: Sym[] = [
  { Icon: ReceiptText, fx: "write", x: -340, y: 24 },
  { Icon: ChartColumnIncreasing, fx: "grow", x: -480, y: 52 },
  { Icon: Calculator, fx: "press", x: -330, y: 78 },
  { Icon: Coins, fx: "bounce", x: -590, y: 32 },
  { Icon: BadgeCheck, fx: "seal", x: 340, y: 27 },
  { Icon: CalendarCheck, fx: "check", x: 490, y: 58 },
  { Icon: ScanLine, fx: "scan", x: 330, y: 80 },
  { Icon: FileSpreadsheet, fx: "cells", x: 590, y: 20 },
];

/** Alternate sides so consecutive effects never sit next to each other */
const ORDER = [0, 4, 1, 6, 3, 5, 2, 7];
const EVERY_MS = 2600;
const EFFECT_MS = 1700;

export function LoginBackdrop() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = root.current;
    const tiles = box?.querySelectorAll<HTMLElement>(".sym");
    if (!box || !tiles?.length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    const pending = new Set<number>();
    const play = () => {
      // Nothing to see when the tab is in the background or the tiles are hidden (phones)
      if (document.hidden || getComputedStyle(box).display === "none") return;
      const el = tiles[ORDER[step++ % ORDER.length]];
      el.classList.remove("is-on");
      void el.offsetWidth; // restart the CSS animation
      el.classList.add("is-on");
      const id = window.setTimeout(() => {
        el.classList.remove("is-on");
        pending.delete(id);
      }, EFFECT_MS);
      pending.add(id);
    };
    const first = window.setTimeout(play, 1400);
    const timer = window.setInterval(play, EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="login-light" aria-hidden>
      <div ref={root} className="login-symbols">
        {SYMBOLS.map(({ Icon, fx, x, y }, i) => (
          <span key={fx} className="sym" data-fx={fx} style={{ "--x": `${x}px`, "--y": `${y}%`, "--i": i } as CSSProperties}>
            <Icon strokeWidth={1.5} />
          </span>
        ))}
      </div>
    </div>
  );
}
