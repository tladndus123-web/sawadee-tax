import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ko", "th", "en", "ja"],
  defaultLocale: "ko",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
