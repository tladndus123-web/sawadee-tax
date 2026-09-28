"use client";

// Continuous shooting: the camera stays open inside the app; every press of the shutter goes straight into the
// upload queue and the AI starts reading. "2 per shot" (default) cuts each picture into a left and a right half,
// read separately at full resolution, so two receipts laid side by side cost one press and lose no accuracy.
// "Several" finds up to 6 receipts laid out on one photo and cuts each out (lib/upload-queue addSeveral).
// A shot that looks the same as the previous one is skipped (compared on the phone, no AI cost).

import { Camera, Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { averageHash, HASH_SIZE, sameScene } from "@/lib/shot-hash";
import { MAX_PER_PHOTO } from "@/lib/split-boxes";
import { addPhotos, addSeveral, useUploadQueue } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

type Mode = "one" | "two" | "many";
const MODE_KEY = "trl.camMode";

export function ContinuousCamera({ onClose, onFallback }: { onClose: () => void; onFallback: () => void }) {
  const t = useTranslations("cam");
  const video = useRef<HTMLVideoElement>(null);
  const lastHash = useRef<string | null>(null);
  const [mode, setMode] = useState<Mode>("two");
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [taken, setTaken] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  /** "Several" shots whose receipts are still being found */
  const [finding, setFinding] = useState(0);
  const items = useUploadQueue();
  const reading = items.filter((it) => it.status === "reading" || it.status === "queued" || it.status === "preparing").length;

  useEffect(() => {
    try {
      const v = localStorage.getItem(MODE_KEY);
      if (v === "one" || v === "two" || v === "many") setMode(v);
    } catch {}
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => {});
        setReady(true);
      })
      .catch(() => setDenied(true));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // Keep the page behind from scrolling while the camera covers it
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const changeMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || !ready || !v.videoWidth) return;
    const w = v.videoWidth;
    const h = v.videoHeight;

    // Same scene as the last shot? (8×8 grey average hash)
    const small = document.createElement("canvas");
    small.width = HASH_SIZE;
    small.height = HASH_SIZE;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;
    sctx.drawImage(v, 0, 0, HASH_SIZE, HASH_SIZE);
    const px = sctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;
    const gray = Array.from({ length: HASH_SIZE * HASH_SIZE }, (_, i) => (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000);
    const hash = averageHash(gray);
    if (sameScene(lastHash.current, hash)) {
      toast.info(t("same"));
      return;
    }
    lastHash.current = hash;
    setFlash((n) => n + 1);

    const cut = async (sx: number, sw: number, name: string): Promise<File> => {
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = h;
      c.getContext("2d")?.drawImage(v, sx, 0, sw, h, 0, 0, sw, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
      if (!blob) throw new Error("no jpeg");
      return new File([blob], name, { type: "image/jpeg" });
    };
    const stamp = Date.now();
    if (mode === "many") {
      const shot = await cut(0, w, `shot-${stamp}.jpg`);
      setThumb((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(shot);
      });
      setFinding((n) => n + 1);
      try {
        const r = await addSeveral(shot);
        setTaken((n) => n + r.accepted);
        if (r.found > 1) toast.success(t("found", { count: r.found }));
        if (r.more) toast.info(t("tooMany", { max: MAX_PER_PHOTO }));
        if (r.accepted < Math.max(1, r.found)) toast.info(t("full"));
      } catch {
        toast.error(t("findFail"));
      } finally {
        setFinding((n) => n - 1);
      }
      return;
    }
    const half = Math.floor(w / 2);
    const files = mode === "two" ? [await cut(0, half, `shot-${stamp}-1.jpg`), await cut(half, w - half, `shot-${stamp}-2.jpg`)] : [await cut(0, w, `shot-${stamp}.jpg`)];
    const accepted = addPhotos(files);
    if (accepted < files.length) toast.info(t("full"));
    setTaken((n) => n + accepted);
    const url = URL.createObjectURL(files[0]);
    setThumb((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  };

  // Rendered on <body>: the page-enter animation (a transform) would otherwise trap "fixed" inside the page
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={t("title")}>
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label={t("close")}>
          <X className="size-5" />
        </button>
        <div className="flex rounded-full bg-white/15 p-1 text-sm font-medium" role="group" aria-label={t("mode")}>
          {(["one", "two", "many"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => changeMode(m)}
              className={cn("rounded-full px-3 py-1.5 transition-colors", mode === m ? "bg-white text-black" : "text-white/80")}
            >
              {t(m)}
            </button>
          ))}
        </div>
        <span className="min-w-10 text-right text-sm font-semibold tabular-nums" aria-live="polite">
          {taken}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="size-full object-cover" />
        {mode === "two" && ready && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2">
            <div className="grid place-items-center border-r-2 border-dashed border-white/70">
              <span className="grid size-9 place-items-center rounded-full bg-black/45 text-lg font-semibold">1</span>
            </div>
            <div className="grid place-items-center">
              <span className="grid size-9 place-items-center rounded-full bg-black/45 text-lg font-semibold">2</span>
            </div>
          </div>
        )}
        {flash > 0 && <div key={flash} className="cam-flash pointer-events-none absolute inset-0 bg-white" />}
        {!ready && !denied && <Loader2 className="absolute top-1/2 left-1/2 size-8 -translate-1/2 animate-spin text-white/70" aria-hidden />}
        {denied && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="grid justify-items-center gap-4">
              <p className="text-[15px] leading-relaxed">{t("denied")}</p>
              <button type="button" onClick={onFallback} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">
                {t("fallback")}
              </button>
            </div>
          </div>
        )}
        <p className="absolute inset-x-4 bottom-3 rounded-2xl bg-black/50 px-3 py-2 text-center text-xs leading-relaxed">{mode === "two" ? t("hintTwo") : mode === "many" ? t("hintMany", { max: MAX_PER_PHOTO }) : t("hintOne")}</p>
      </div>

      <div className="grid grid-cols-3 items-center px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <div className="flex items-center gap-2">
          <span className="size-12 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL
              <img src={thumb} alt="" className="size-full object-cover" />
            )}
          </span>
          {reading + finding > 0 && (
            <span className="flex items-center gap-1 text-xs text-white/80">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {finding > 0 ? t("finding") : reading}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!ready}
          aria-label={t("shoot")}
          className="press mx-auto grid size-[72px] place-items-center rounded-full bg-white ring-4 ring-white/35 ring-offset-4 ring-offset-black disabled:opacity-40"
        >
          <Camera className="size-7 text-black" aria-hidden />
        </button>
        <button type="button" onClick={onClose} className="ml-auto flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black">
          <Check className="size-4" aria-hidden />
          {t("done")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
