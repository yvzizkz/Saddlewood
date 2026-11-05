import { describe, expect, it } from "vitest";

import { parseRunEmail, payDateFor, runEmail, runProblem, runSubject, startLines, type RunLine } from "../payrollRun";

// KB #435038 and #455577, word for word.
const OCT_23 = "Employees:\nFiliberto Villegas: 70.33 hours\nSubs:\nArnold Mujica: $1,489.25\nAdrián López: $1,575.93\nCesar Olivares: $1,394.80\nMarcus Ulm: $1,875\nOmar Peña: $3,390\nRomel Bernal: $1,200\nErick Jesus: $800\nCesar Alberto: $960\nRolando Vite: $500\nEli Lugo: $3,000\nAngel Lopez: $1,500\nThank you\nIlene";
const OCT_30 = "Subs:\nOmar Peña: $3,390\nRomel Bernal: $1,200\nErick Jesus: $960\nCesar Alberto: $800\nRolando Vite: $500\nAngel Lopez: $1,000\nBelico’s Mora LLC: $1,600 (W9 attached)\nThank you\nIlene";

const sub = (name: string, cents: number): RunLine => ({ name, kind: "sub", hours: null, amountCents: cents, note: "" });
const emp = (name: string, hours: number | null): RunLine => ({ name, kind: "employee", hours, amountCents: null, note: "" });

describe("the Wednesday run", () => {
  it("reads Ilene's emails and writes them back word for word", () => {
    expect(runEmail(parseRunEmail(OCT_23), "Ilene")).toBe(OCT_23);
    expect(runEmail(parseRunEmail(OCT_30), "Ilene")).toBe(OCT_30);
    expect(parseRunEmail(OCT_30).at(-1)).toEqual({ name: "Belico’s Mora LLC", kind: "sub", hours: null, amountCents: 160_000, note: "W9 attached" });
    expect(parseRunEmail(OCT_23)[0]).toEqual(emp("Filiberto Villegas", 70.33));
  });

  it("pays the Friday of the Wednesday it's run", () => {
    expect(payDateFor("2026-10-21")).toBe("2026-10-23");
    expect(payDateFor("2026-10-23")).toBe("2026-10-23");
    expect(payDateFor("2026-10-24")).toBe("2026-10-30");
    expect(runSubject("2026-10-23")).toBe("Payroll 10/23/26");
  });

  it("starts from the last run: amounts carry, the clock fills hours, and new people are added", () => {
    const started = startLines([{ ...sub("Omar Peña", 339_000), note: "W9 attached" }, sub("Arnold Mujica", 148_925), emp("Filiberto Villegas", 70.33), emp("Gone", 10)], [
      { name: "Filiberto Villegas", hours: 41.5, costCents: 100 },
      { name: "Arnold Mujica", hours: 30, costCents: 90_000 },
      { name: "New Person", hours: 8, costCents: 16_000 },
    ]);
    expect(started).toEqual([sub("Omar Peña", 339_000), sub("Arnold Mujica", 90_000), emp("Filiberto Villegas", 41.5), emp("Gone", null), sub("New Person", 16_000)]);
  });

  it("refuses a line with no figure, a blank name and the same person twice", () => {
    expect(runProblem([])).toMatch(/at least one/);
    expect(runProblem([emp("A", null)])).toMatch(/A: fill in the hours/);
    expect(runProblem([sub("A", 0)])).toMatch(/A: fill in the amount/);
    expect(runProblem([sub(" ", 1)])).toMatch(/needs a name/);
    expect(runProblem([sub("A", 1), sub("a", 2)])).toMatch(/on the run twice/);
    expect(runProblem([sub("A", 1), emp("B", 2)])).toBeNull();
  });
});
