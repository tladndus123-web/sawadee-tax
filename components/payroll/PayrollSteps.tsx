"use client";

// This month's payroll in five steps (owner, 2026-11-06: "근태 → 급여 계산 → 확인 → 명세서 LINE 발송 → 신고, 지금 몇 번째
// 단계인지"): each step says how far it is, worked out from what is saved — attendance rows, saved pay lines, the
// office checks — and for the last two a mark: payslips sent (set when the LINE send goes out, or ticked here) and the
// month's filing done (the same tick as the tax calendar's ภ.ง.ด.1 / สปส.1-10 item). A tap opens the step's tab.

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadAttendance } from "@/lib/attendance-store";
import type { Employee } from "@/lib/payroll";
import { loadPayroll, loadPayrollChecks } from "@/lib/payroll-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tab = "attendance" | "run" | "employees" | "filing";
type Step = { key: "attendance" | "pay" | "check" | "slips" | "filing"; tab: Tab; done: number; total: number; mark?: string };

/** The step to show as "now": the first one not done */
export const currentStep = (steps: { done: number; total: number }[]) => {
  const i = steps.findIndex((s) => s.total === 0 || s.done < s.total);
  return i === -1 ? steps.length : i;
};

export function PayrollSteps({ month, staff, refresh, onTab }: { month: string; staff: Employee[]; refresh: unknown; onTab: (t: Tab) => void }) {
  const t = useTranslations("pay.steps");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [round, setRound] = useState(0);
  const ids = staff.map((e) => e.id).join(",");

  useEffect(() => {
    if (!staff.length) return setSteps(null);
    let live = true;
    const mine = new Set(staff.map((e) => e.id));
    void Promise.all([
      loadAttendance({ month }),
      loadPayroll({ month }),
      loadPayrollChecks(month),
      supabaseBrowser().from("calendar_done").select("key").in("key", [`slips:${month}`, `monthly:${month}`]),
    ])
      .then(([att, lines, checks, marks]) => {
        if (!live) return;
        const n = mine.size;
        const count = (xs: Iterable<string>) => new Set([...xs].filter((id) => mine.has(id))).size;
        const marked = new Set((marks.data ?? []).map((r) => r.key as string));
        setSteps([
          { key: "attendance", tab: "attendance", done: count(att.map((r) => r.employeeId)), total: n },
          { key: "pay", tab: "run", done: count(lines.map((l) => l.employeeId)), total: n },
          { key: "check", tab: "run", done: count(checks.keys()), total: n },
          { key: "slips", tab: "run", done: marked.has(`slips:${month}`) ? 1 : 0, total: 1, mark: `slips:${month}` },
          { key: "filing", tab: "filing", done: marked.has(`monthly:${month}`) ? 1 : 0, total: 1, mark: `monthly:${month}` },
        ]);
      })
      .catch(() => live && setSteps(null));
    return () => void (live = false);
  }, [month, ids, refresh, round]); // eslint-disable-line react-hooks/exhaustive-deps -- staff by its ids

  // Coming back to the window (a payslip sent from a phone, the calendar ticked) shows the latest
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && setRound((r) => r + 1);
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);

  if (!steps) return null;
  const now = currentStep(steps);
  const mark = async (key: string, on: boolean) => {
    const sb = supabaseBrowser();
    const { error } = on ? await sb.from("calendar_done").upsert({ key }, { onConflict: "key" }) : await sb.from("calendar_done").delete().eq("key", key);
    if (error) return void toast.error(t("fail"));
    setRound((r) => r + 1);
  };

  return (
    <section className="workspace-panel grid gap-3 p-4 sm:p-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        <span className={cn("text-[13px] font-medium", now === steps.length ? "text-ok" : "text-primary")}>
          {now === steps.length ? t("allDone") : t("nowAt", { n: now + 1, total: steps.length })}
        </span>
      </div>
      <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = s.total > 0 && s.done >= s.total;
          const isNow = i === now;
          return (
            <li key={s.key} className="relative">
              {i > 0 && <span className={cn("absolute top-[19px] right-[calc(50%+22px)] left-[calc(-50%+22px)] h-0.5 rounded-full max-sm:hidden", i <= now ? "bg-ok/60" : "bg-border")} aria-hidden />}
              <button
                type="button"
                onClick={() => onTab(s.tab)}
                aria-current={isNow ? "step" : undefined}
                className={cn("press grid w-full justify-items-center gap-1.5 rounded-2xl px-1 py-2 text-center", isNow && "bg-primary/8")}
              >
                <span
                  className={cn(
                    "relative grid size-10 place-items-center rounded-full text-[14px] font-bold",
                    done ? "bg-ok text-white" : isNow ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-5" aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-[12px] leading-tight font-semibold sm:text-[13px]", !done && !isNow && "text-muted-foreground")}>{t(`name.${s.key}`)}</span>
                <span className="text-[11px] leading-tight text-muted-foreground tabular-nums">
                  {s.mark ? (done ? t("doneShort") : t("notYet")) : t("count", { done: s.done, total: s.total })}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {now < steps.length && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/50 px-3.5 py-2.5">
          <p className="text-[13px] leading-snug">{t(`hint.${steps[now].key}`)}</p>
          {steps[now].mark && (
            <button type="button" onClick={() => void mark(steps[now].mark!, true)} className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-medium shadow-[0_0_0_1px_var(--border)] hover:bg-muted">
              <Check className="size-4 text-ok" aria-hidden />
              {t(steps[now].key === "slips" ? "markDone.slips" : "markDone.filing")}
            </button>
          )}
        </div>
      )}
      {steps.some((s) => s.mark && s.done) && (
        <p className="flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
          {steps
            .filter((s) => s.mark && s.done)
            .map((s) => (
              <button key={s.key} type="button" onClick={() => void mark(s.mark!, false)} className="hover:text-foreground hover:underline">
                {t("undo", { step: t(`name.${s.key}`) })}
              </button>
            ))}
        </p>
      )}
    </section>
  );
}
