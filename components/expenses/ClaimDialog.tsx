"use client";

// A new (or waiting) expense claim: snap the receipt — the AI reads the shop, day and amount, as on the upload screen
// — pick what it was for from the company's list, add a note, send. Without a photo (when the company allows it) the
// fields are typed in.

import { Camera, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CategoryIcon, useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { claimPhotoUrl, notifyClaim, saveClaim, useClaims } from "@/lib/expense-store";
import { type Claim, claimProblems, docAmount } from "@/lib/expenses";
import { fromSatang, toSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import type { Category, LedgerDoc } from "@/lib/types";
import { preparePhoto } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";

export function ClaimDialog({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  const t = useTranslations("expenses");
  const catLabel = useCategoryLabel();
  const me = useMe();
  const { settings } = useClaims();
  const [day, setDay] = useState(claim?.day ?? todayBangkok());
  const [seller, setSeller] = useState(claim?.seller ?? "");
  const [amount, setAmount] = useState(claim ? fromSatang(claim.amount) : 0);
  const [category, setCategory] = useState<Category>(claim?.category ?? settings.categories[0] ?? "supplies");
  const [note, setNote] = useState(claim?.note ?? "");
  const [doc, setDoc] = useState<LedgerDoc | null>(claim?.doc ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (photo) {
      const u = URL.createObjectURL(photo);
      setPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    if (claim?.photoPath) void claimPhotoUrl(claim.photoPath).then(setPreview);
  }, [photo, claim?.photoPath]);

  const read = async (f: File) => {
    setReading(true);
    try {
      const ready = await preparePhoto(f);
      setPhoto(ready);
      const form = new FormData();
      form.append("photo", ready);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) throw new Error(String(res.status));
      const { doc: d } = (await res.json()) as { doc: LedgerDoc };
      setDoc(d);
      const name = d.seller.name.en || d.seller.name.th || d.seller.name.ja;
      if (name) setSeller(name);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) setDay(d.date);
      if (docAmount(d) > 0) setAmount(fromSatang(docAmount(d)));
      if (settings.categories.includes(d.category)) setCategory(d.category);
      toast.success(t("readOk"));
    } catch {
      toast.message(t("readFail"));
    } finally {
      setReading(false);
    }
  };

  const problems = claimProblems({ day, amount: toSatang(amount), photoPath: claim?.photoPath ?? null }, settings, !!photo);
  const send = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    try {
      const saved = await saveClaim({ id: claim?.id, name: claim?.name || me.name || me.email, day, seller, amount: toSatang(amount), category, note, doc }, photo);
      if (!claim && saved.status === "pending" && settings.line) notifyClaim(saved.id);
      toast.success(claim ? t("savedChange") : saved.status === "approved" ? t("sentAuto") : t("sent"));
      onClose();
    } catch {
      toast.error(t("fail"));
      setBusy(false);
    }
  };

  const cats = settings.categories.includes(category) ? settings.categories : [...settings.categories, category];
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{claim ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newSub")}</DialogDescription>
        </DialogHeader>

        {/* Photo */}
        <div className={cn("relative grid overflow-hidden rounded-2xl border-2 border-dashed", tried && problems.includes("photo") ? "border-bad" : "border-border")}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t("photo")} className="max-h-64 w-full bg-muted object-contain" />
          ) : (
            <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
              <Camera className="size-8 text-primary" aria-hidden />
              <p className="text-[15px] font-semibold">{t("snap")}</p>
              <p className="text-[13px] text-muted-foreground">{settings.photo ? t("snapNeeded") : t("snapOptional")}</p>
            </div>
          )}
          {reading && (
            <span className="absolute inset-0 grid place-items-center bg-background/70 text-[14px] font-medium">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("reading")}
              </span>
            </span>
          )}
          {doc && !reading && (
            <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-foreground/80 px-2.5 py-1 text-[12px] text-background">
              <Sparkles className="size-3.5" aria-hidden />
              {t("aiRead")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground">
            <Camera className="size-4" aria-hidden />
            {t("camera")}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => (e.target.files?.[0] && void read(e.target.files[0]), (e.target.value = ""))} />
          </label>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border px-4 text-[14px] font-semibold">
            <ImagePlus className="size-4" aria-hidden />
            {t("album")}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => (e.target.files?.[0] && void read(e.target.files[0]), (e.target.value = ""))} />
          </label>
        </div>

        {/* Fields */}
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("amount")}</span>
            <MoneyInput value={amount} onChange={setAmount} className={cn("h-12 text-[20px] font-semibold", tried && problems.includes("amount") && "border-bad")} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">{t("day")}</span>
              <DateInput value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">{t("seller")}</span>
              <Input value={seller} onChange={(e) => setSeller(e.target.value)} maxLength={120} placeholder={t("sellerPh")} className="h-11" />
            </label>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("what")}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("what")}>
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={cn("flex h-10 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-[13px] font-medium", category === c ? "border-primary bg-primary/10 text-primary" : "border-border")}
                >
                  <CategoryIcon category={c} className="size-7 rounded-full" />
                  {catLabel(c)}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("note")}</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={t("notePh")} />
          </label>
        </div>
        {tried && problems.length > 0 && <p className="text-[13px] font-medium text-bad">{problems.map((p) => t(`need.${p}`)).join(" · ")}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" className="h-11 rounded-full px-6" disabled={busy || reading} onClick={() => void send()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {claim ? t("save") : t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
