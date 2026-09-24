"use client";

import { useStoredFormConfig } from "@/lib/form-config-store";
import { FormConfigProvider } from "./form-config-context";

/** Provides the saved company form settings to every form below it. */
export function StoredFormConfig({ children }: { children: React.ReactNode }) {
  const cfg = useStoredFormConfig();
  return <FormConfigProvider config={cfg}>{children}</FormConfigProvider>;
}
