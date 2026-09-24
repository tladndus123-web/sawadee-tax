"use client";

import { Loader2, Lock, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidReason } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

const PRESETS = ["presetDup", "presetRewrite", "presetWrong", "presetTest"] as const;
const SHRED_MS = 2100;
const STRIPS = 12;

export interface PaperInfo {
  title: string;
  seller: string;
  amount: string;
}

/**
 * Delete button with role check, required reason, then a shredder animation while the
 * soft delete runs. Staff see a locked button that explains only admins can delete.
 */
export function DeleteFlow({
  isAdmin,
  paper,
  disabled,
  onDelete,
  onDone,
}: {
  isAdmin: boolean;
  paper: PaperInfo;
  disabled?: boolean;
  onDelete: (reason: string) => Promise<void>;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [shredding, setShredding] = useState(false);

  if (!isAdmin) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-disabled
            className="h-11 cursor-not-allowed rounded-full px-4 text-muted-foreground opacity-60 hover:bg-transparent hover:text-muted-foreground"
            onClick={() => toast.info(t("del.adminOnly"))}
          >
            <Lock className="size-4" />
            {t("app.del")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("del.adminOnly")}</TooltipContent>
      </Tooltip>
    );
  }

  const confirm = async () => {
    if (!isValidReason(reason)) return;
    setBusy(true);
    setOpen(false);
    setShredding(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      await Promise.all([onDelete(reason.trim()), new Promise((r) => setTimeout(r, reduced ? 400 : SHRED_MS))]);
      // Leave the overlay up; the next screen replaces it, so the old page never flashes back
      onDone();
    } catch {
      toast.error(t("app.saveFail"));
      setShredding(false);
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-11 rounded-full px-4 text-bad hover:bg-bad-soft hover:text-bad"
        onClick={() => setOpen(true)}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {t("app.del")}
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("del.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("del.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <label htmlFor="delete-reason" className="text-sm font-semibold">
              {t("del.reason")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((k) => {
                const text = t(`del.${k}`);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={reason === text}
                    onClick={() => setReason(text)}
                    className={cn(
                      "min-h-9 rounded-full px-3 text-[13px] font-medium transition-colors",
                      reason === text ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
            <Textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder={t("del.reasonPh")}
              rows={3}
              className="rounded-xl"
              aria-required
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("del.cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" className="rounded-full" disabled={!isValidReason(reason)} onClick={confirm}>
              <Trash2 className="size-4" />
              {t("del.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {shredding && createPortal(<Shredder paper={paper} caption={t("del.shredding")} />, document.body)}
    </>
  );
}

/** The paper the shredder eats; drawn once whole and once per strip so the cut pieces line up. */
function PaperFace({ paper }: { paper: PaperInfo }) {
  return (
    <div className="shred-paper grid content-start gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="size-5 rounded-md bg-[linear-gradient(135deg,#0894ff,#c959dd_40%,#ff2e54_70%,#ff9004)]" />
        <span className="h-2 w-16 rounded-full bg-black/10" />
      </div>
      <p className="truncate text-[15px] font-semibold text-black">{paper.seller}</p>
      <p className="mono truncate text-xs text-black/50">{paper.title}</p>
      {[88, 72, 80, 60, 76, 52].map((w, i) => (
        <span key={i} className="h-1.5 rounded-full bg-black/8" style={{ width: `${w}%` }} />
      ))}
      <p className="mt-2 text-right text-lg font-semibold text-black tabular-nums">{paper.amount}</p>
    </div>
  );
}

function Shredder({ paper, caption }: { paper: PaperInfo; caption: string }) {
  return (
    <div className="shredder-overlay fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-md" role="status" aria-live="assertive">
      <div className="grid justify-items-center">
        {/* Paper feeding into the slot (clipped at the slot) */}
        <div className="shred-feed-window">
          <div className="shred-feed">
            <PaperFace paper={paper} />
          </div>
        </div>
        {/* The machine */}
        <div className="shred-machine">
          <span className="shred-slot" />
          <span className="shred-led" />
        </div>
        {/* Strips coming out below, each showing its slice of the same paper */}
        <div className="shred-out">
          {Array.from({ length: STRIPS }, (_, i) => (
            <div
              key={i}
              className="shred-strip"
              style={
                {
                  "--i": i,
                  "--r": `${((i * 37) % 13) - 6}deg`,
                  "--x": `${((i * 53) % 9) - 4}px`,
                  "--d": `${(i % 4) * 25}ms`,
                } as React.CSSProperties
              }
            >
              <div className="shred-strip-inner">
                <PaperFace paper={paper} />
              </div>
            </div>
          ))}
        </div>
        <p className="ai-text mt-2 text-sm font-semibold">{caption}</p>
      </div>
    </div>
  );
}
