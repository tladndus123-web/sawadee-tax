import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The floating dev badge sat on top of the mobile tab bar and action bar.
const nextConfig: NextConfig = {
  devIndicators: false,
  // The AI reading (app upload and LINE bot) reads the prototype prompt from disk at runtime
  outputFileTracingIncludes: {
    "/api/extract": ["./docs/reference/extract-prompt.txt"],
    "/api/line/webhook": ["./docs/reference/extract-prompt.txt"],
  },
};

export default withNextIntl(nextConfig);
