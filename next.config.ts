import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const SHARP_LINUX = ["./node_modules/@img/sharp-linux-x64/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*"];

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The floating dev badge sat on top of the mobile tab bar and action bar.
const nextConfig: NextConfig = {
  devIndicators: false,
  // The AI reading (app upload and LINE bot) reads the prototype prompt from disk at runtime, and cuts long
  // slips with sharp, whose Linux binaries the file tracer misses on its own (Vercel: "Could not load sharp")
  outputFileTracingIncludes: {
    "/api/extract": ["./docs/reference/extract-prompt.txt", ...SHARP_LINUX],
    "/api/line/webhook": ["./docs/reference/extract-prompt.txt", ...SHARP_LINUX],
  },
};

export default withNextIntl(nextConfig);
