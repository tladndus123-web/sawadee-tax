"use client";

// One open-source (lucide, ISC licence) icon per spending category, each on its own soft tint — used for vendors so a
// company is recognisable at a glance (a noodle shop shows a bowl, a petrol station a pump).

import { Briefcase, Building, Car, Fuel, Package, Refrigerator, SprayCan, Store, UtensilsCrossed, Wine, Wrench, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOOK: Record<Category, { icon: typeof Store; cls: string }> = {
  food: { icon: UtensilsCrossed, cls: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  transport: { icon: Car, cls: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  fuel: { icon: Fuel, cls: "bg-amber-500/14 text-amber-700 dark:text-amber-400" },
  office: { icon: Briefcase, cls: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
  supplies: { icon: Package, cls: "bg-teal-500/12 text-teal-600 dark:text-teal-400" },
  consumables: { icon: SprayCan, cls: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400" },
  repairs: { icon: Wrench, cls: "bg-stone-500/14 text-stone-700 dark:text-stone-300" },
  utilities: { icon: Zap, cls: "bg-yellow-500/16 text-yellow-700 dark:text-yellow-400" },
  rent: { icon: Building, cls: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  entertainment: { icon: Wine, cls: "bg-pink-500/12 text-pink-600 dark:text-pink-400" },
  asset: { icon: Refrigerator, cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  other: { icon: Store, cls: "bg-muted text-muted-foreground" },
};

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const t = useTranslations("category");
  const { icon: Icon, cls } = LOOK[category] ?? LOOK.other;
  return (
    <span role="img" aria-label={t(category)} title={t(category)} className={cn("grid size-10 flex-none place-items-center rounded-2xl", cls, className)}>
      <Icon className="size-[45%]" aria-hidden />
    </span>
  );
}
