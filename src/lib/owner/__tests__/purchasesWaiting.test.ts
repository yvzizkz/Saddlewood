import { describe, expect, it } from "vitest";

import type { UnmatchedPurchase } from "@/lib/crew/purchases";
import { PURCHASE_ITEMS, buildWaiting, type WaitingInput } from "../waiting";

// "Which job is this?" on the owners' Home (0022): one line per Home Depot
// register name with no job, in the money lane, the biggest spend first, and
// the long tail folded into one line.

const NOW = new Date("2026-10-19T16:00:00Z");

function name(over: Partial<UnmatchedPurchase> & { key: string }): UnmatchedPurchase {
  return { name: over.key.toUpperCase(), trips: 1, lines: 1, cents: 1000, lastOn: "2026-08-12", firstOn: "2026-08-12", ...over };
}

function input(purchases?: UnmatchedPurchase[], olderPurchases?: WaitingInput["olderPurchases"]): WaitingInput {
  return { now: NOW, people: [], reports: [], tasks: [], jobs: [], timefixes: 0, reviews: 0, money: null, purchases, olderPurchases };
}

describe("Which job is this? on Home", () => {
  it("asks about each name with its trips, spend and last date, biggest first", () => {
    const items = buildWaiting(input([name({ key: "gainey 45", name: "Gainey #45", cents: 90000, trips: 3, lastOn: "2026-10-02" }), name({ key: "pt loma", name: "PT LOMA", trips: 41, cents: 1346600 })]));
    expect(items).toEqual([
      {
        key: "purchase-pt loma",
        lane: "money",
        kind: "decision",
        title: "Which job is this? 'PT LOMA'",
        detail: "41 trips, $13,466, last Aug 12",
        href: "/app/crew?view=today",
        at: null,
      },
      {
        key: "purchase-gainey 45",
        lane: "money",
        kind: "decision",
        title: "Which job is this? 'Gainey #45'",
        detail: "3 trips, $900, last Oct 2",
        href: "/app/crew?view=today",
        at: null,
      },
    ]);
  });

  it("folds the long tail into one line, and asks nothing with nothing waiting", () => {
    const many = Array.from({ length: PURCHASE_ITEMS + 2 }, (_, i) => name({ key: `name ${i}`, cents: (i + 1) * 100 }));
    const items = buildWaiting(input(many));
    expect(items).toHaveLength(PURCHASE_ITEMS + 1);
    expect(items[0].title).toBe(`Which job is this? 'NAME ${PURCHASE_ITEMS + 1}'`);
    expect(items[PURCHASE_ITEMS]).toMatchObject({ key: "purchase-more", lane: "money", title: "2 more Home Depot names need a job", detail: "'NAME 1' $2, 'NAME 0' $1" });
    expect(buildWaiting(input([]))).toEqual([]);
    expect(buildWaiting(input())).toEqual([]);
  });

  it("sums the names from before the app into one line, never cards (0026)", () => {
    const items = buildWaiting(input([name({ key: "pt loma", name: "PT LOMA", cents: 1346600, trips: 41 })], { count: 1100, cents: 12345600 }));
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({
      key: "purchase-older",
      lane: "money",
      kind: "decision",
      title: "1,100 older Home Depot names from before the app",
      detail: "$123,456 across them; find them with search.",
      href: "/app/money",
      at: null,
    });
    expect(buildWaiting(input([], { count: 1, cents: 500 }))[0].title).toBe("1 older Home Depot name from before the app");
    expect(buildWaiting(input([], { count: 0, cents: 0 }))).toEqual([]);
  });
});
