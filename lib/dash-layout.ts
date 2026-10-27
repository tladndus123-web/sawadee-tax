// The dashboard's cards, in the order each person likes and with the ones they don't need hidden (owner, 2026-10-27:
// "대시보드 카드 순서·숨기기"). Kept per person in their sign-in (auth user_metadata.dash), so it follows them to every
// phone and PC. Wide cards (the month, the four figures) sit on top in their order; the others flow in two columns
// below, in their order, the columns balancing themselves.

export const DASH_CARDS = ["profit", "tiles", "todo", "recent", "cost", "team"] as const;
export type DashCard = (typeof DASH_CARDS)[number];
export const WIDE: ReadonlySet<DashCard> = new Set(["profit", "tiles"]);

export interface DashLayout {
  order: DashCard[];
  hidden: DashCard[];
}

export const DEFAULT_LAYOUT: DashLayout = { order: [...DASH_CARDS], hidden: [] };

const isCard = (v: unknown): v is DashCard => typeof v === "string" && (DASH_CARDS as readonly string[]).includes(v);

/** Whatever was stored → a full, clean layout (unknown names out, new cards added at the end, no duplicates) */
export function readLayout(v: unknown): DashLayout {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const order = [...new Set((Array.isArray(o.order) ? o.order : []).filter(isCard))];
  for (const c of DASH_CARDS) if (!order.includes(c)) order.push(c);
  const hidden = [...new Set((Array.isArray(o.hidden) ? o.hidden : []).filter(isCard))];
  return { order, hidden };
}

/** One card up (-1) or down (+1) */
export function moveCard(l: DashLayout, card: DashCard, by: -1 | 1): DashLayout {
  const i = l.order.indexOf(card);
  const j = i + by;
  if (i < 0 || j < 0 || j >= l.order.length) return l;
  const order = [...l.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
}

export const toggleCard = (l: DashLayout, card: DashCard): DashLayout => ({ ...l, hidden: l.hidden.includes(card) ? l.hidden.filter((c) => c !== card) : [...l.hidden, card] });

/** What to draw: the wide cards first, then the others, both in the person's order, hidden ones left out */
export function arrange(l: DashLayout): { wide: DashCard[]; rest: DashCard[] } {
  const shown = l.order.filter((c) => !l.hidden.includes(c));
  return { wide: shown.filter((c) => WIDE.has(c)), rest: shown.filter((c) => !WIDE.has(c)) };
}
