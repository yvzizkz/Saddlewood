import { describe, expect, it } from "vitest";

import { DEFAULT_PRESENT } from "@/lib/sales/templates";
import type { Presentation } from "@/lib/sales/types";
import { VARIATIONS } from "../PresentPane";

describe("variations", () => {
  it("picking one never lights up another", () => {
    for (const v of VARIATIONS) {
      const p: Presentation = { ...DEFAULT_PRESENT, ...v.set };
      const lit = VARIATIONS.filter((w) => Object.entries(w.set).every(([k, val]) => p[k as keyof Presentation] === val));
      expect(lit.map((w) => w.key)).toEqual([v.key]);
    }
  });
});
