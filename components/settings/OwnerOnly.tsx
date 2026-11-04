"use client";

// Shows its content to owners only (staff management, owner 2026-11-04)

import type { ReactNode } from "react";
import { useMe } from "@/lib/role-store";

export function OwnerOnly({ children }: { children: ReactNode }) {
  return useMe().owner ? <>{children}</> : null;
}
