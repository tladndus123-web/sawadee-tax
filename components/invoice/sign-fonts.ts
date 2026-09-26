// Handwriting faces for typed signatures, one per script (SIL Open Font License, self-hosted by next/font).
// Kept out of lib/fonts.ts so their ~250 @font-face rules only load with the screens that show signatures
// (SignBoxes), not on every page. Put `signFontVariables` on the element that uses `font-sign`.
import { Caveat, Charm, Nanum_Pen_Script, Yomogi } from "next/font/google";

const signLatin = Caveat({ subsets: ["latin"], variable: "--font-sign-latin", display: "swap", preload: false });
const signThai = Charm({ weight: ["400", "700"], subsets: ["thai"], variable: "--font-sign-thai", display: "swap", preload: false });
const signJp = Yomogi({ weight: "400", subsets: ["latin"], variable: "--font-sign-jp", display: "swap", preload: false });
const signKr = Nanum_Pen_Script({ weight: "400", subsets: ["latin"], variable: "--font-sign-kr", display: "swap", preload: false });

export const signFontVariables = [signLatin, signThai, signJp, signKr].map((f) => f.variable).join(" ");
