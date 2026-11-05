import { describe, expect, it } from "vitest";

import { computeDraw } from "../progress";
import { parseSchedule, scheduleProblem, trackerSchedule } from "../scheduleEntry";

const line = (name: string, contract: number, changeOrder: number, completedPrior: number, thisInvoice = 0, draw = 0) => ({ id: name, name, contract, changeOrder, completedPrior, thisInvoice, draw, tbd: false, note: "" });

describe("a schedule brought in from before the app", () => {
  it("takes the tracker's lines, billed including this invoice and any draw, and leaves out lines with no money", () => {
    const lines = trackerSchedule({ lines: [line("Kitchen", 89512, 0, 69000), line("Fireplaces", 28087, 0, 0, 0, 15000), line("Baths", 62055, 0, 46000, 5000), line("Rear deck", 0, 42448.14, 14000), line("Attic", 0, 0, 0)] });
    expect(lines).toEqual([
      { description: "Kitchen", amountCents: 8_951_200, billedCents: 6_900_000 },
      { description: "Fireplaces", amountCents: 2_808_700, billedCents: 1_500_000 },
      { description: "Baths", amountCents: 6_205_500, billedCents: 5_100_000 },
      { description: "Rear deck", amountCents: 4_244_814, billedCents: 1_400_000 },
    ]);
  });

  it("reads a spreadsheet paste, a header row and a blank billed cell", () => {
    expect(parseSchedule("Line\tAmount\tBilled\nKitchen\t$89,512.00\t69,000\nDeck | 100 |\n\n")).toEqual({
      lines: [
        { description: "Kitchen", amountCents: 8_951_200, billedCents: 6_900_000 },
        { description: "Deck", amountCents: 10_000, billedCents: 0 },
      ],
      errors: [],
    });
    expect(parseSchedule("Kitchen\t100\nno amount here").errors).toEqual(["Row 2: needs a description, an amount and what's billed, split by tabs or |."]);
  });

  it("refuses an empty schedule, a credit line and more billed than the line", () => {
    expect(scheduleProblem([])).toMatch(/at least one/);
    expect(scheduleProblem([{ description: "A", amountCents: -1, billedCents: 0 }])).toMatch(/more than \$0/);
    expect(scheduleProblem([{ description: "A", amountCents: 100, billedCents: 101 }])).toMatch(/between/);
    expect(scheduleProblem([{ description: "A", amountCents: 100, billedCents: 100 }])).toBeNull();
  });

  it("a line billed to the penny, not a round percent, bills nothing until it moves", () => {
    const kitchen = { key: "line:1", description: "Kitchen", scheduledCents: 8_951_200, billedToDateCents: 6_900_000, pctToDate: 77.08, kind: "sov" as const };
    const still = computeDraw([kitchen], {});
    expect(still.grossCents).toBe(0);
    expect(still.billedToDateCents).toBe(6_900_000);
    expect(computeDraw([kitchen], { "line:1": 77.08 }).grossCents).toBe(0);
    expect(computeDraw([kitchen], { "line:1": 80 }).grossCents).toBe(260_960);
  });
});
