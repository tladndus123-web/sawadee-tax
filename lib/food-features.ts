// The restaurant extras (owner 2026-11-18: "음식점 기능은 설정에 넣어두고 나중에 켤 수 있도록"): delivery-app settlements
// read by AI, the AI prep forecast and the waste log. All off until an admin switches them on in Settings
// (company_settings.extras, migration …004500). Pure.

import type { NavFeature } from "./nav-menu";

export const FOOD_FEATURES = ["delivery", "prep", "waste"] as const;
export type FoodFeature = (typeof FOOD_FEATURES)[number];

export type FoodFeatures = Record<FoodFeature, boolean>;

/** What is on: only a stored `true` counts (a new or unknown setting stays off) */
export function readFoodFeatures(extras: unknown): FoodFeatures {
  const o = extras && typeof extras === "object" && !Array.isArray(extras) ? (extras as Record<string, unknown>) : {};
  return Object.fromEntries(FOOD_FEATURES.map((k) => [k, o[k] === true])) as FoodFeatures;
}

/** The extras with a menu item of their own */
export const menuFeatures = (f: FoodFeatures): NavFeature[] => (f.waste ? ["waste"] : []);
