"use client";

// After signing in: which branch to work in (owner's decision 2026-10-06). Staff tap a branch and type its PIN when it
// has one (the database then opens it for this sign-in, lib/branch-lock.ts); admins pick any branch or all of them
// without a PIN. Asked once per sign-in. The same list opens from the branch button in the top bar for staff.

import { ChevronRight, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chosenFor, markChosen, myUnlock, signInMark, unlockBranch, useBranchPins } from "@/lib/branch-lock";
import { ALL, branchLabel } from "@/lib/branches";
import { setBranch, useBranch, useBranches } from "@/lib/branch-store";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";

/** The list of branches to enter; `onDone` after one was opened */
export function BranchPicker({ onDone }: { onDone?: () => void }) {
  const t = useTranslations("gate");
  const names = useBranchName();
  const me = useMe();
  const staff = me.role !== "admin";
  const { branches } = useBranches();
  const { pins } = useBranchPins();
  const selected = useBranch();
  const [asking, setAsking] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (asking) pinRef.current?.focus();
  }, [asking]);

  const enter = async (id: string) => {
    markChosen(await signInMark());
    setBranch(id);
    onDone?.();
    // Staff: the database now shows another branch — load everything afresh
    if (staff) window.location.reload();
  };

  const pick = async (id: string) => {
    setError(null);
    if (!staff || id === ALL) return void enter(id);
    if (pins.has(id)) {
      setAsking(id);
      setPin("");
      return;
    }
    setBusy(id);
    try {
      // An open branch: no PIN, but it closes the branch opened before
      await unlockBranch(id, "");
      await enter(id);
    } catch {
      setError(t("fail"));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!asking) return;
    setBusy(asking);
    setError(null);
    try {
      const r = await unlockBranch(asking, pin);
      if (r === "ok") return void (await enter(asking));
      setError(r === "wait" ? t("wait") : t("wrong"));
      setPin("");
    } catch {
      setError(t("fail"));
    } finally {
      setBusy(null);
    }
  };

  const rows = [...(staff ? [] : [ALL]), ...branches.map((b) => b.id)];
  return (
    <ul className="grid gap-2">
      {rows.map((id) => {
        const b = id === ALL ? null : (branches.find((x) => x.id === id) ?? null);
        const locked = staff && !!b && pins.has(b.id);
        const open = asking === id;
        return (
          <li key={id} className={cn("overflow-hidden rounded-2xl bg-card ring-1 ring-border", open && "ring-2 ring-primary")}>
            <button
              type="button"
              onClick={() => void pick(id)}
              disabled={busy !== null}
              aria-expanded={locked ? open : undefined}
              className="press flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <BranchAvatar branch={b} branches={branches} size="size-9" className="text-sm" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[15px] font-semibold">{b ? branchLabel(b, names) : t("all")}</span>
                {selected === id && <span className="text-[11px] text-muted-foreground">{t("current")}</span>}
              </span>
              {busy === id && !open ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : locked ? (
                <Lock className="size-4 text-muted-foreground" aria-label={t("locked")} />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              )}
            </button>
            {open && (
              <form
                className="grid gap-2 border-t px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("pin")}</span>
                  <Input
                    ref={pinRef}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    autoComplete="off"
                    type="password"
                    className="mono h-11 text-center text-lg tracking-[0.4em]"
                    aria-invalid={!!error}
                  />
                </label>
                {error && <p className="text-xs font-medium text-bad">{error}</p>}
                <Button type="submit" className="h-10 rounded-full" disabled={pin.length < 4 || busy !== null}>
                  {busy === id && <Loader2 className="size-4 animate-spin" />}
                  {t("enter")}
                </Button>
              </form>
            )}
          </li>
        );
      })}
      {error && !asking && <li className="text-xs font-medium text-bad">{error}</li>}
    </ul>
  );
}

/** Shows the branch list instead of the page until a branch is chosen for this sign-in */
export function BranchGate({ children }: { children: ReactNode }) {
  const t = useTranslations("gate");
  const me = useMe();
  const { branches, loaded } = useBranches();
  const { pins, loaded: pinsLoaded } = useBranchPins();
  const selected = useBranch();
  const [state, setState] = useState<"checking" | "open" | "ask">("checking");

  useEffect(() => {
    if (!me.loaded || !loaded || !pinsLoaded) return;
    if (!me.userId) return setState("open");
    let live = true;
    void (async () => {
      const staff = me.role !== "admin";
      const need = branches.length >= 2 || (staff && pins.size > 0);
      let next: "open" | "ask" = "open";
      if (need) {
        if (chosenFor() !== (await signInMark())) next = "ask";
        else if (staff && (selected === ALL || (pins.has(selected) && (await myUnlock())?.branchId !== selected))) next = "ask";
      }
      if (live) setState(next);
    })();
    return () => void (live = false);
  }, [me.loaded, me.userId, me.role, loaded, pinsLoaded, branches.length, pins, selected]);

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <Loader2 className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;
  return (
    <section className="mx-auto grid w-full max-w-md gap-5 pt-4 sm:pt-10" aria-labelledby="gate-title">
      <div className="grid gap-1.5 text-center">
        <h1 id="gate-title" className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{me.role === "admin" ? t("hintAdmin") : t("hint")}</p>
      </div>
      <BranchPicker onDone={() => setState("open")} />
    </section>
  );
}
