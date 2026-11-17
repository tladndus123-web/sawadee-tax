// Card heading (owner 2026-11-18, from the for-sale version): every card titles itself the same way — an optional icon,
// 18px semibold, and an optional action on the right ("전체 보기", a settings button …).

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SECTION_TITLE = "text-lg leading-snug font-semibold tracking-tight";

export function SectionTitle({
  icon: Icon,
  id,
  as: Tag = "h2",
  action,
  className,
  children,
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  id?: string;
  as?: "h2" | "h3";
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const title = (
    <Tag id={id} className={cn("flex min-w-0 items-center gap-2", SECTION_TITLE, !action && className)}>
      {Icon && <Icon className="size-5 flex-none text-primary" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </Tag>
  );
  if (!action) return title;
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {title}
      <div className="flex flex-none items-center gap-1">{action}</div>
    </div>
  );
}
