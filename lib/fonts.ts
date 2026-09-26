// Open-source fonts (SIL Open Font License), self-hosted by next/font at build time.
// UI: Inter (Latin, close to Apple's SF), Noto Sans Thai, Noto Sans JP, IBM Plex Sans KR; IBM Plex Mono for codes.
// Signature handwriting faces live in components/invoice/sign-fonts.ts (loaded only with signatures).
import { IBM_Plex_Mono, IBM_Plex_Sans_KR, Inter, Noto_Sans_JP, Noto_Sans_Thai } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const notoThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-noto-thai",
  display: "swap",
});

export const notoJp = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-jp",
  display: "swap",
  preload: false,
});

export const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-kr",
  display: "swap",
  preload: false,
});

export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const fontVariables = [inter, notoThai, notoJp, plexKr, plexMono].map((f) => f.variable).join(" ");
