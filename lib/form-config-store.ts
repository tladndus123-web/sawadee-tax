"use client";

// Company form settings, stored in company_settings.form_config (step 5). Read through sanitizeFormConfig().

import { useMemo } from "react";
import { saveCompany, useCompany } from "./company-store";
import { type FormConfig, sanitizeFormConfig } from "./form-config";
import { LABEL_KEYS } from "./form-labels";

export function useStoredFormConfig(): FormConfig {
  const { formConfig } = useCompany();
  return useMemo(() => sanitizeFormConfig(formConfig, LABEL_KEYS), [formConfig]);
}

/** Admin only (RLS). Throws when the database refuses. */
export const saveFormConfig = (cfg: FormConfig) => saveCompany({ form_config: sanitizeFormConfig(cfg, LABEL_KEYS) });
