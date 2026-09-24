"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_FORM_CONFIG, type FormConfig, type HideableField } from "@/lib/form-config";
import { type FormMode, type LabelKey, joinLabel, pickLabel } from "@/lib/form-labels";

const Ctx = createContext<FormConfig>(DEFAULT_FORM_CONFIG);

export function FormConfigProvider({ config, children }: { config: FormConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

export const useFormConfig = () => useContext(Ctx);

/** Label helpers with the company's label overrides applied, plus a visibility check */
export function useFormLabels() {
  const cfg = useFormConfig();
  return useMemo(() => {
    const hidden = new Set<string>(cfg.hidden);
    return {
      pick: (k: LabelKey, mode: FormMode) => pickLabel(k, mode, cfg.labels),
      join: (k: LabelKey, mode: FormMode, sep = " · ") => joinLabel(k, mode, sep, cfg.labels),
      /** true when the field is shown in view mode */
      show: (f: HideableField) => !hidden.has(f),
    };
  }, [cfg]);
}
