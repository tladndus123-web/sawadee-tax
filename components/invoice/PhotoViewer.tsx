"use client";

import { ImageOff, RotateCw, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import type { Box } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Original photo with zoom (wheel / pinch / buttons), pan and 90° rotation.
 * `focus` zooms into a field's box (0–1 fractions) and outlines it.
 */
export function PhotoViewer({
  src,
  alt,
  focus,
  labels,
  className,
}: {
  src: string | null;
  alt: string;
  focus?: { box: Box; nonce: number } | null;
  labels: { zoomIn: string; zoomOut: string; reset: string; rotate: string };
  className?: string;
}) {
  const api = useRef<ReactZoomPanPinchRef>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [broken, setBroken] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  // Zoom so the focused box sits in the middle of the viewer
  useEffect(() => {
    const ref = api.current;
    if (!focus || !ref || !src || loadedSrc !== src) return;
    setRotation(0);
    const content = ref.instance.contentComponent;
    if (!content || !frame.current) return;
    const [bx, by, bw, bh] = focus.box;
    const cw = content.offsetWidth;
    const ch = content.offsetHeight;
    // Visible area (the frame may clip a tall photo)
    const ww = frame.current.clientWidth;
    const wh = frame.current.clientHeight;
    const fit = Math.min(ww / (bw * cw), wh / (bh * ch)) * 0.6;
    const s = Math.min(6, Math.max(1.5, fit));
    const x = ww / 2 - (bx + bw / 2) * cw * s;
    const y = wh / 2 - (by + bh / 2) * ch * s;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.setTransform(x, y, s, reduced ? 0 : 400);
  }, [focus, loadedSrc, src]);

  if (!src || broken) {
    return (
      <div className={cn("grid aspect-[3/4] place-items-center rounded-md border border-dashed text-muted-foreground", className)}>
        <ImageOff className="size-8" aria-hidden />
      </div>
    );
  }

  const b = focus?.box;
  return (
    <div ref={frame} className={cn("relative overflow-hidden rounded-2xl border bg-muted/40", className)}>
      <TransformWrapper ref={api} minScale={1} maxScale={8} centerOnInit doubleClick={{ mode: "zoomIn" }}>
        <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full">
          <div className="relative w-full transition-transform duration-200" style={{ transform: `rotate(${rotation}deg)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs / blob URLs */}
            <img src={src} alt={alt} className="block h-auto w-full select-none" draggable={false} onLoad={() => setLoadedSrc(src)} onError={() => setBroken(true)} />
            {b && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-sm outline-2 outline-offset-2 outline-warn"
                style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }}
              />
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
      <div className="glass-header absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border p-1.5 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={labels.zoomIn} onClick={() => api.current?.zoomIn()}>
          <ZoomIn className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={labels.zoomOut} onClick={() => api.current?.zoomOut()}>
          <ZoomOut className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={labels.reset} onClick={() => api.current?.resetTransform()}>
          <Maximize className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={labels.rotate}
          onClick={() => {
            setRotation((r) => (r + 90) % 360);
            api.current?.resetTransform();
          }}
        >
          <RotateCw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
