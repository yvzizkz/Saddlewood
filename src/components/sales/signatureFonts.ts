import { Allura, Caveat, Dancing_Script, Great_Vibes, Homemade_Apple, Mrs_Saint_Delafield, Pinyon_Script, Sacramento } from "next/font/google";

import type { SignatureFont } from "@/lib/sales/settings";

// The typed-signature styles (settings.ts SIGNATURE_FONTS). Served from our
// own site by next/font, so the signing page never calls out to Google.

const dancing = Dancing_Script({ subsets: ["latin"], weight: "500", display: "swap" });
const greatvibes = Great_Vibes({ subsets: ["latin"], weight: "400", display: "swap" });
const allura = Allura({ subsets: ["latin"], weight: "400", display: "swap" });
const sacramento = Sacramento({ subsets: ["latin"], weight: "400", display: "swap" });
const pinyon = Pinyon_Script({ subsets: ["latin"], weight: "400", display: "swap" });
const homemade = Homemade_Apple({ subsets: ["latin"], weight: "400", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "500", display: "swap" });
const delafield = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", display: "swap" });

export const SIGNATURE_FAMILY: Record<SignatureFont, string> = {
  dancing: dancing.style.fontFamily,
  greatvibes: greatvibes.style.fontFamily,
  allura: allura.style.fontFamily,
  sacramento: sacramento.style.fontFamily,
  pinyon: pinyon.style.fontFamily,
  homemade: homemade.style.fontFamily,
  caveat: caveat.style.fontFamily,
  delafield: delafield.style.fontFamily,
};

/** How big each style is set so they read at about the same size. */
export const SIGNATURE_SCALE: Record<SignatureFont, number> = {
  dancing: 1,
  greatvibes: 1.15,
  allura: 1.15,
  sacramento: 1.2,
  pinyon: 1.05,
  homemade: 0.8,
  caveat: 1.05,
  delafield: 1.35,
};
