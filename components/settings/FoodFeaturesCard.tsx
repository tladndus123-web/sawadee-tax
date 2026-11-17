"use client";

// 음식점 기능 (owner 2026-11-18: "설정에 넣어두고 나중에 켤 수 있도록"): three switches, all off until an admin turns one on —
// delivery-app settlements read by AI (a button on the sales screen), the AI prep forecast (a dashboard card) and the
// waste log (its own menu item, LINE "폐기"). Saved company-wide in company_settings.extras.

import { ChefHat, Loader2, Trash2, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { type FoodFeature, FOOD_FEATURES } from "@/lib/food-features";
import { setFoodFeature, useFoodFeatures } from "@/lib/food-features-store";
import { useMe } from "@/lib/role-store";

const ICON = { delivery: Truck, prep: ChefHat, waste: Trash2 } as const;

export function FoodFeaturesCard() {
  const t = useTranslations("food");
  const me = useMe();
  const f = useFoodFeatures();
  const [busy, setBusy] = useState<FoodFeature | null>(null);
  const admin = me.role === "admin";
  const flip = async (k: FoodFeature, on: boolean) => {
    setBusy(k);
    try {
      await setFoodFeature(k, on);
      toast.success(on ? t("on", { name: t(`${k}.name`) }) : t("off", { name: t(`${k}.name`) }));
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(null);
    }
  };
  if (!f.loaded) return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label={t("loading")} />;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{admin ? t("sub") : t("subStaff")}</p>
      <ul className="grid gap-2">
        {FOOD_FEATURES.map((k) => {
          const Icon = ICON[k];
          return (
            <li key={k} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3.5">
              <span className="grid size-10 flex-none place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-[15px] font-semibold">{t(`${k}.name`)}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">{t(`${k}.what`)}</span>
              </span>
              {busy === k ? (
                <Loader2 className="size-5 flex-none animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <Switch checked={f[k]} disabled={!admin} onCheckedChange={(on) => void flip(k, on)} aria-label={t(`${k}.name`)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
