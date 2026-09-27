import type { MetadataRoute } from "next";

// Home-screen app (PWA): opens full screen without the browser bar. "/" sends each person to their language.
// Icons: scripts/make-app-icons.mjs. Colours match the light page background (components/layout/theme-color.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sawadee TAX",
    short_name: "Sawadee TAX",
    description: "Thai tax invoices → AI reading → ledger · タイの領収書を読み取り帳簿に",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eaecf0",
    theme_color: "#eaecf0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the icon: straight to reading photos
    shortcuts: [{ name: "Upload · 写真を読む · อัปโหลด", url: "/upload", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
