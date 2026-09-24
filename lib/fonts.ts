// Open-source fonts (SIL Open Font License), self-hosted by next/font at build time.
// UI: Inter (Latin, close to Apple's SF), Noto Sans Thai, Noto Sans JP, IBM Plex Sans KR; IBM Plex Mono for codes.
// Signatures: handwriting faces per script (Caveat, Charm, Yomogi, Nanum Pen Script).
import {
  Caveat,
  Charm,
  IBM_Plex_Mono,
  IBM_Plex_Sans_KR,
  Inter,
  Nanum_Pen_Script,
  Noto_Sans_JP,
  Noto_Sans_Thai,
  Yomogi,
} from "next/font/google";

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

// Signature faces load only when a typed signature is on screen (preload off, unicode-range subsets)
export const signLatin = Caveat({ subsets: ["latin"], variable: "--font-sign-latin", display: "swap", preload: false });
export const signThai = Charm({ weight: ["400", "700"], subsets: ["thai"], variable: "--font-sign-thai", display: "swap", preload: false });
export const signJp = Yomogi({ weight: "400", subsets: ["latin"], variable: "--font-sign-jp", display: "swap", preload: false });
export const signKr = Nanum_Pen_Script({ weight: "400", subsets: ["latin"], variable: "--font-sign-kr", display: "swap", preload: false });

export const fontVariables = [inter, notoThai, notoJp, plexKr, plexMono, signLatin, signThai, signJp, signKr].map((f) => f.variable).join(" ");
