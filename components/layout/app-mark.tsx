// App logo (Sawadee TAX): a white tax invoice with a yellow check on a glowing blue tile.
// The drawing lives in public/app-mark.svg; app/icon.svg (browser tab) is the same file and
// app/apple-icon.png is rendered from it — keep the three in sync.

/** Soft blue light around the logo; pass a size class (e.g. "size-8") */
// One filter with both shadows (two drop-shadow utilities would replace each other); brighter on dark backgrounds
export const APP_MARK_GLOW =
  "[filter:drop-shadow(0_2px_6px_rgb(4_60_190/0.28))_drop-shadow(0_0_14px_rgb(20_110_255/0.45))] dark:[filter:drop-shadow(0_0_16px_rgb(70_150_255/0.65))]";

export function AppMark({ className }: { className?: string }) {
  // Decorative: the app name is always written next to it
  // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG
  return <img src="/app-mark.svg" alt="" aria-hidden="true" draggable={false} className={className} />;
}
