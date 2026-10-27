"use client";

// On a saved ledger document (admins): "a member paid this themselves" → it becomes their expense claim, approved,
// so the money owed to them shows on the expenses page (owner, 2026-10-27). The document stays in the ledger; paying
// the claim back marks it paid. Once moved, the card says to whom and links to the expenses page.

import { HandCoins, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { moveToClaim, useClaims } from "@/lib/expense-store";
import { docAmount } from "@/lib/expenses";
import { bahtWhole } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LedgerDoc } from "@/lib/types";

type Member = { userId: string; name: string };

export function ToExpenseCard({ documentId, doc, photoPath }: { documentId: string; doc: LedgerDoc; photoPath: string | null }) {
  const t = useTranslations("expenses.move");
  const ts = useTranslations("expenses.st");
  const me = useMe();
  const { claims, loaded } = useClaims();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || members.length) return;
    void supabaseBrowser()
      .from("members")
      .select("user_id, name, email")
      .is("disabled_at", null)
      .order("name")
      .then(({ data }) => setMembers((data ?? []).map((m) => ({ userId: m.user_id as string, name: (m.name as string) || (m.email as string) }))));
  }, [open, members.length]);

  if (me.role !== "admin" || !loaded) return null;
  const linked = claims.find((c) => c.documentId === documentId);
  const amount = docAmount(doc);

  if (linked)
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm print:hidden">
        <HandCoins className="size-4 flex-none text-brand" aria-hidden />
        <span>{t("linked", { name: linked.name, status: ts(linked.status) })}</span>
        <Link href="/expenses" className="font-semibold text-primary hover:underline">
          {t("open")}
        </Link>
      </p>
    );
  if (!(amount > 0)) return null;

  const move = async () => {
    const person = members.find((m) => m.userId === who);
    if (!person) return;
    setBusy(true);
    try {
      await moveToClaim(documentId, doc, photoPath, person, note);
      toast.success(t("done", { name: person.name }));
      setOpen(false);
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm print:hidden">
        <span className="flex items-center gap-2 text-muted-foreground">
          <HandCoins className="size-4 flex-none" aria-hidden />
          {t("ask")}
        </span>
        <Button type="button" variant="secondary" className="h-9 rounded-full px-4" onClick={() => setOpen(true)}>
          {t("button")}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("sub", { amount: bahtWhole(amount / 100) })}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("who")}</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px]">
              <option value="">{t("pick")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">{t("note")}</span>
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="h-11" />
          </label>
          <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">{t("keeps")}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" className="rounded-full px-6" disabled={busy || !who} onClick={() => void move()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
