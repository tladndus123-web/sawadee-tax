"use client";

// A sales channel's name on screen: the company's own (settings of the delivery-app card, e.g. "other" → "Wongnai"),
// else the standard one.

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useCompany } from "@/lib/company-store";
import type { Channel } from "@/lib/sales";

export function useChannelLabel(): (ch: Channel | string) => string {
  const t = useTranslations("sales.ch");
  const { channelNames } = useCompany();
  return useCallback((ch: Channel | string) => channelNames?.[ch]?.trim() || t(ch as Channel), [channelNames, t]);
}
