import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Order shown in the language menus: Japanese first (default), Korean last
  locales: ["ja", "th", "en", "ko"],
  defaultLocale: "ja",
  localePrefix: "always",
  // Remember the language someone picked for a year (default would forget it when the browser closes)
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type Locale = (typeof routing.locales)[number];
