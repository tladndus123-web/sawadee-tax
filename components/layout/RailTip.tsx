"use client";

// The narrow sidebar's name bubble: on the icon rail each icon's name shows at once to its right on hover or keyboard
// focus (a Radix tooltip in a portal, so the rail never clips it). Wide, the names are written out: nothing is wrapped.

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function RailTip({ on, label, children }: { on: boolean; label: ReactNode; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <Tooltip delayDuration={80}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} collisionPadding={8} className="z-[70] px-2.5 py-1.5 text-[13px] font-medium shadow-lg">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
