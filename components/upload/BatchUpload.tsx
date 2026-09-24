"use client";

import { Camera, ChevronLeft, CircleAlert, CircleCheck, ImagePlus, Images, Loader2, RotateCw, Sparkles, Square, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DocumentReview } from "@/components/invoice/DocumentReview";
import { Button } from "@/components/ui/button";
import { saveEntry } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { joinTri } from "@/lib/form-labels";
import {
  addPhotos,
  getPhoto,
  MAX_PHOTOS,
  removePhoto,
  retryPhoto,
  stopPhoto,
  type UploadError,
  type UploadItem,
  updateDoc,
  useUploadQueue,
} from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/** Pick / drop / shoot up to 5 photos; each is read by the AI at the same time, then checked one by one. */
export function BatchUpload() {
  const t = useTranslations();
  const items = useUploadQueue();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const now = useNow(items.some((it) => it.status === "reading" || it.status === "preparing"));

  const room = MAX_PHOTOS - items.length;
  const settled = items.filter((it) => it.status === "done" || it.status === "failed" || it.status === "stopped").length;
  const current = items.find((it) => it.id === reviewing && it.doc);

  const add = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name));
    if (!files.length) return;
    if (room <= 0) {
      toast.info(t("batch.full", { max: MAX_PHOTOS }));
      return;
    }
    const taken = addPhotos(files);
    if (taken < files.length) toast.info(t("batch.limit", { max: MAX_PHOTOS, count: files.length - taken }));
  };

  const errorText = (e: UploadError | null) => {
    switch (e) {
      case "rate":
        return t("app.rateLimited");
      case "notDoc":
        return t("app.notDoc");
      case "badImage":
        return t("app.badImage");
      case "noKey":
        return t("batch.noKey");
      case "network":
        return t("batch.network");
      case "busy":
        return t("batch.busy");
      default:
        return t("app.aiFail");
    }
  };

  if (current?.doc) {
    return (
      <div className="grid gap-4">
        <Button type="button" variant="ghost" className="-ml-3 w-fit text-primary print:hidden" onClick={() => setReviewing(null)}>
          <ChevronLeft className="size-4" />
          {t("batch.back")}
        </Button>
        <DocumentReview
          key={current.id}
          initial={current.doc}
          photoUrl={current.preview}
          isNew
          onSave={async (doc) => {
            updateDoc(current.id, doc);
            await saveEntry(doc, getPhoto(current.id));
            removePhoto(current.id);
            setReviewing(null);
            toast.success(t("trash.saved"));
          }}
          onDraft={async (doc) => {
            await saveEntry(doc, getPhoto(current.id), undefined, "draft");
            removePhoto(current.id);
            setReviewing(null);
            toast.success(t("archive.drafted"));
          }}
          onClose={() => setReviewing(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:gap-8">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("batch.title")}</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{t("batch.intro", { max: MAX_PHOTOS })}</p>
        <MaxNotice />
      </header>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "workspace-panel ai-ring grid justify-items-center gap-5 rounded-[1.75rem] px-6 py-10 text-center transition-transform sm:py-14",
          dragging && "scale-[1.01]",
          room <= 0 && "opacity-70",
        )}
      >
        <span className="ai-orb size-16"><Sparkles className="size-7" aria-hidden /></span>
        <div className="grid gap-1">
          <p className="text-lg font-semibold tracking-tight">{t("batch.drop")}</p>
          <p className="text-sm text-muted-foreground">{t("batch.formats")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" className="h-11 rounded-full px-6 text-[15px]" disabled={room <= 0} onClick={() => pickRef.current?.click()}>
            <ImagePlus className="size-4" />
            {t("app.pick")}
          </Button>
          <Button type="button" variant="secondary" className="h-11 rounded-full px-5 text-[15px] md:hidden" disabled={room <= 0} onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" />
            {t("batch.camera")}
          </Button>
        </div>
        <div className="grid justify-items-center gap-2" aria-live="polite">
          <span className="flex gap-1.5" aria-hidden>
            {Array.from({ length: MAX_PHOTOS }, (_, i) => (
              <span key={i} className={cn("size-2 rounded-full transition-colors", i < items.length ? "bg-primary" : "bg-foreground/15")} />
            ))}
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            <span className="font-semibold text-foreground">{t("batch.count", { count: items.length, max: MAX_PHOTOS })}</span>
            {" · "}
            {room > 0 ? t("batch.room", { count: room }) : t("batch.full", { max: MAX_PHOTOS })}
          </p>
        </div>
        <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <section className="grid gap-3" aria-label={t("batch.back")}>
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-sm font-semibold" role="status">{t("batch.progress", { done: settled, total: items.length })}</p>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:w-48" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(settled / items.length) * 100}%` }} />
            </div>
          </div>
          <ul className="grid gap-3">
            {items.map((it) => (
              <Row key={it.id} it={it} now={now} errorText={errorText} onReview={() => setReviewing(it.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "Up to 5 at once" pill, also used on the dashboard */
export function MaxNotice({ className }: { className?: string }) {
  const t = useTranslations("batch");
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand", className)}>
      <Images className="size-4" aria-hidden />
      {t("maxNotice", { max: MAX_PHOTOS })}
    </span>
  );
}

function Row({ it, now, errorText, onReview }: { it: UploadItem; now: number; errorText: (e: UploadError | null) => string; onReview: () => void }) {
  const t = useTranslations();
  const sec = Math.max(0, Math.round(((it.finishedAt ?? now) - it.startedAt) / 1000));
  const busy = it.status === "reading" || it.status === "preparing";
  const title = it.doc ? joinTri(it.doc.seller.name, "en") || it.doc.docNo || it.name : it.name;

  return (
    <li className="workspace-panel flex min-w-0 items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <div className="relative size-16 flex-none overflow-hidden rounded-xl bg-muted sm:size-20">
        {it.preview && (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL
          <img src={it.preview} alt="" className="size-full object-cover" />
        )}
        {busy && <span className="absolute inset-0 grid place-items-center bg-black/25"><Loader2 className="size-5 animate-spin text-white" aria-hidden /></span>}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        {it.status === "done" && it.doc ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{baht(it.doc.totals.net)}</span>
            {it.doc.docNo && <span className="mono text-xs">{it.doc.docNo}</span>}
          </p>
        ) : (
          it.error && <p className="mt-0.5 text-xs leading-relaxed text-bad">{errorText(it.error)}</p>
        )}
        <Status it={it} sec={sec} />
      </div>

      <div className="flex flex-none items-center gap-1">
        {it.status === "done" && (
          <Button type="button" className="h-10 rounded-full px-4" onClick={onReview}>
            {t("batch.review")}
          </Button>
        )}
        {(it.status === "failed" || it.status === "stopped") && it.preview && (
          <Button type="button" variant="secondary" className="h-10 rounded-full px-4" onClick={() => retryPhoto(it.id)}>
            <RotateCw className="size-4" />
            <span className="max-sm:sr-only">{t("batch.retry")}</span>
          </Button>
        )}
        {it.status === "reading" && (
          <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={t("app.stop")} onClick={() => stopPhoto(it.id)}>
            <Square className="size-4" />
          </Button>
        )}
        {it.status !== "reading" && it.status !== "preparing" && (
          <Button type="button" variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={t("batch.remove")} onClick={() => removePhoto(it.id)}>
            <X className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function Status({ it, sec }: { it: UploadItem; sec: number }) {
  const t = useTranslations("batch");
  const map = {
    preparing: { icon: Loader2, cls: "text-muted-foreground", text: t("preparing"), spin: true },
    reading: { icon: Sparkles, cls: "ai-text", text: t("reading", { sec }), spin: false },
    done: { icon: CircleCheck, cls: "text-ok", text: `${t("done")} · ${t("readIn", { sec })}`, spin: false },
    failed: { icon: CircleAlert, cls: "text-bad", text: t("failed"), spin: false },
    stopped: { icon: Square, cls: "text-muted-foreground", text: t("stopped"), spin: false },
  }[it.status];
  const Icon = map.icon;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
      <Icon className={cn("size-3.5 flex-none", it.status === "reading" ? "text-[var(--ai-2)]" : map.cls, map.spin && "animate-spin")} aria-hidden />
      <span className={map.cls}>{map.text}</span>
    </p>
  );
}

/** Ticks once a second while something is being read, for the elapsed-seconds counter */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
