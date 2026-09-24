"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Role, saveMe, useMe } from "@/lib/role-store";

/** TEMPORARY: pick admin / staff in this browser until sign-in and member roles exist (step 5). */
export function RoleSettings() {
  const t = useTranslations("role");
  const me = useMe();
  return (
    <section aria-labelledby="role-title" className="workspace-panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-6">
      <div className="grid gap-1">
        <h2 id="role-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {me.role === "admin" ? <ShieldCheck className="size-5 text-primary" aria-hidden /> : <UserRound className="size-5 text-muted-foreground" aria-hidden />}
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="grid gap-3 sm:w-72">
        <ToggleGroup
          type="single"
          className="segmented-control w-full"
          value={me.role}
          onValueChange={(v) => v && saveMe({ ...me, role: v as Role })}
          aria-label={t("title")}
        >
          <ToggleGroupItem value="admin" className="flex-1 px-4">
            {t("admin")}
          </ToggleGroupItem>
          <ToggleGroupItem value="staff" className="flex-1 px-4">
            {t("staff")}
          </ToggleGroupItem>
        </ToggleGroup>
        <label className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">{t("name")}</span>
          <Input value={me.name} maxLength={40} placeholder={t("namePh")} onChange={(e) => saveMe({ ...me, name: e.target.value })} className="h-10" />
        </label>
      </div>
    </section>
  );
}
