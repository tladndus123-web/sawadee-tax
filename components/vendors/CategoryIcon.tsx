"use client";

// One open-source (lucide, ISC licence) icon per spending category, each on its own soft tint — used for vendors so a
// company is recognisable at a glance (a noodle shop shows a bowl, a petrol station a pump). The company's own
// categories (settings) pick an icon and colour from the sets below. Also: the category's name in the screen
// language, and the list to choose from, for every screen.

import {
  Bike,
  Briefcase,
  Building,
  Car,
  Coffee,
  Fuel,
  GraduationCap,
  HeartPulse,
  Megaphone,
  Package,
  Refrigerator,
  Shirt,
  ShoppingCart,
  SprayCan,
  Store,
  Tag,
  Truck,
  UtensilsCrossed,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { type CategoryRow, type UiLang, UI_LANGS, useCategories } from "@/lib/category-store";
import { type BuiltinCategory, type Category, isBuiltinCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Icons a category can wear (name → component) */
export const CATEGORY_ICONS = {
  utensils: UtensilsCrossed,
  car: Car,
  fuel: Fuel,
  briefcase: Briefcase,
  package: Package,
  "spray-can": SprayCan,
  wrench: Wrench,
  zap: Zap,
  building: Building,
  wine: Wine,
  refrigerator: Refrigerator,
  store: Store,
  tag: Tag,
  truck: Truck,
  bike: Bike,
  coffee: Coffee,
  cart: ShoppingCart,
  shirt: Shirt,
  megaphone: Megaphone,
  wifi: Wifi,
  heart: HeartPulse,
  school: GraduationCap,
} as const;
export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/** Colours a category can wear (name → soft tint classes) */
export const CATEGORY_COLORS = {
  orange: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  blue: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  purple: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  teal: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  pink: "bg-pink-500/12 text-pink-600 dark:text-pink-400",
  red: "bg-red-500/12 text-red-600 dark:text-red-400",
  slate: "bg-muted text-muted-foreground",
} as const;
export type CategoryColor = keyof typeof CATEGORY_COLORS;

const BUILTIN_LOOK: Record<BuiltinCategory, { icon: CategoryIconName; color: CategoryColor }> = {
  food: { icon: "utensils", color: "orange" },
  transport: { icon: "car", color: "blue" },
  fuel: { icon: "fuel", color: "amber" },
  office: { icon: "briefcase", color: "purple" },
  supplies: { icon: "package", color: "teal" },
  consumables: { icon: "spray-can", color: "blue" },
  repairs: { icon: "wrench", color: "slate" },
  utilities: { icon: "zap", color: "amber" },
  rent: { icon: "building", color: "purple" },
  entertainment: { icon: "wine", color: "pink" },
  asset: { icon: "refrigerator", color: "green" },
  other: { icon: "store", color: "slate" },
};

/** Icon and colour of a category: its own setting, else the built-in look, else a tag */
export function lookOf(key: string, row?: CategoryRow): { icon: CategoryIconName; color: CategoryColor } {
  const base = isBuiltinCategory(key) ? BUILTIN_LOOK[key] : { icon: "tag" as const, color: "slate" as const };
  const icon = row?.icon && row.icon in CATEGORY_ICONS ? (row.icon as CategoryIconName) : base.icon;
  const color = row?.color && row.color in CATEGORY_COLORS ? (row.color as CategoryColor) : base.color;
  return { icon, color };
}

const uiLang = (locale: string): UiLang => ((UI_LANGS as readonly string[]).includes(locale) ? (locale as UiLang) : "en");

/** The name of a category in the screen language: the company's name for it, else the built-in one */
export function useCategoryLabel(): (key: string) => string {
  const t = useTranslations("category");
  const lang = uiLang(useLocale());
  const { rows } = useCategories();
  return useCallback(
    (key: string) => {
      const row = rows.find((r) => r.key === key);
      const own = row?.name?.[lang]?.trim();
      if (own) return own;
      if (isBuiltinCategory(key)) return t(key);
      return row ? Object.values(row.name).find((v) => v?.trim()) || key : key;
    },
    [rows, lang, t],
  );
}

/** Categories to choose from (hidden ones left out, except the one already chosen) */
export function useCategoryOptions(current?: string): { key: Category; label: string }[] {
  const { rows } = useCategories();
  const label = useCategoryLabel();
  return useMemo(() => rows.filter((r) => !r.hidden || r.key === current).map((r) => ({ key: r.key, label: label(r.key) })), [rows, current, label]);
}

export function CategoryIcon({ category, className }: { category: Category | string; className?: string }) {
  const label = useCategoryLabel();
  const { rows } = useCategories();
  const { icon, color } = lookOf(category, rows.find((r) => r.key === category));
  const Icon = CATEGORY_ICONS[icon];
  return (
    <span role="img" aria-label={label(category)} title={label(category)} className={cn("grid size-10 flex-none place-items-center rounded-2xl", CATEGORY_COLORS[color], className)}>
      <Icon className="size-[45%]" aria-hidden />
    </span>
  );
}
