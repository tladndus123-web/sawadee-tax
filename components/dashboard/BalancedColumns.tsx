"use client";

// Two columns that end together (owner, 2026-11-06: "빈자리가 싫어"): the cards are first drawn at their natural
// height and measured, then dealt in order to the column that is shorter so far, and the last card of each column
// stretches to the row's height (its content stays at the top). Below the lg breakpoint the cards simply stack in
// the person's order. CSS multi-columns could not do this: they balance but never stretch.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";
const wide = () => (typeof window === "undefined" ? false : window.matchMedia(QUERY).matches);
const onWide = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

type Item = { key: string; node: ReactNode };

export function BalancedColumns({ items }: { items: Item[] }) {
  const twoCols = useSyncExternalStore(onWide, wide, () => false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  // Natural heights known for every card: only then does the last card of a column stretch
  const [measured, setMeasured] = useState(false);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const stretched = useRef(new Set<string>());
  const keys = items.map((i) => i.key).join("|");

  // New cards or a new width: measure again from natural heights
  useEffect(() => {
    setMeasured(false);
    stretched.current.clear();
  }, [keys, twoCols]);

  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setHeights((h) => {
        let changed = false;
        const next = { ...h };
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.card ?? "";
          // A stretched card's height is the column's, not its own
          if (stretched.current.has(key)) continue;
          const v = Math.round(e.contentRect.height);
          if (v > 0 && next[key] !== v) {
            next[key] = v;
            changed = true;
          }
        }
        return changed ? next : h;
      });
    });
    for (const el of refs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [keys, twoCols]);

  useEffect(() => {
    if (!measured && items.every((i) => heights[i.key])) setMeasured(true);
  }, [measured, heights, items]);

  const card = (it: Item, stretch: boolean) => (
    <div
      key={it.key}
      data-card={it.key}
      ref={(el) => {
        if (el) refs.current.set(it.key, el);
        else refs.current.delete(it.key);
      }}
      className={stretch ? "flex min-w-0 flex-1 flex-col [&>*]:flex-1 [&>*]:content-start" : "min-w-0"}
    >
      {it.node}
    </div>
  );

  if (!twoCols) return <div className="grid grid-cols-[minmax(0,1fr)] gap-5">{items.map((it) => card(it, false))}</div>;

  // The split whose taller column is the shortest (every split of a handful of cards is tried; each column keeps the
  // person's order). Unknown heights count as the average. Ties go to the split that fills the left column first.
  const known = Object.values(heights);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 300;
  const h = items.map((it) => (heights[it.key] ?? avg) + 20);
  let best = 0;
  let bestTall = Infinity;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let l = 0;
    let r = 0;
    for (let i = 0; i < items.length; i++) if (mask & (1 << i)) r += h[i];
    else l += h[i];
    const tall = Math.max(l, r);
    if (tall < bestTall) {
      bestTall = tall;
      best = mask;
    }
  }
  const cols: Item[][] = [[], []];
  items.forEach((it, i) => cols[best & (1 << i) ? 1 : 0].push(it));
  stretched.current = measured ? new Set(cols.map((c) => c[c.length - 1]?.key).filter((k): k is string => !!k)) : new Set();

  return (
    <div className="grid grid-cols-2 gap-5">
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-5">
          {col.map((it, j) => card(it, measured && j === col.length - 1))}
        </div>
      ))}
    </div>
  );
}
