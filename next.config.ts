import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const SHARP_LINUX = ["./node_modules/@img/sharp-linux-x64/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*"];

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Security headers on every page (owner, 2026-10-13). The page may only talk to itself and our Supabase project,
// can never be shown inside another site (clickjacking), and only this site's own camera use is allowed.
// Scripts keep 'unsafe-inline' for Next's own start-up scripts and the theme script; 'unsafe-eval' only in dev.
// Without the address at build time, any Supabase project (never "nothing", which would break the app)
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co";
const supabaseWs = supabase.replace(/^http/, "ws");
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// The floating dev badge sat on top of the mobile tab bar and action bar.
const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // The AI reading (app upload and LINE bot) reads the prototype prompt from disk at runtime, and cuts long
  // slips with sharp, whose Linux binaries the file tracer misses on its own (Vercel: "Could not load sharp").
  // Every route that reaches lib/extract-server (loadSharp) needs them — lib/sharp-trace.test.ts checks the list.
  outputFileTracingIncludes: {
    "/api/extract": ["./docs/reference/extract-prompt.txt", ...SHARP_LINUX],
    "/api/line/webhook": ["./docs/reference/extract-prompt.txt", ...SHARP_LINUX],
    // 2026-11-11: receipt splitting fell back to the whole photo in production ("sharp unavailable")
    "/api/split": SHARP_LINUX,
    "/api/extract-sales": SHARP_LINUX,
    "/api/calendar/read": SHARP_LINUX,
    "/api/payroll/schedule-read": SHARP_LINUX,
    // Grok Bot's add_receipt reads the photo like the LINE bot (prompt + sharp)
    "/api/mcp": ["./docs/reference/extract-prompt.txt", ...SHARP_LINUX],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
