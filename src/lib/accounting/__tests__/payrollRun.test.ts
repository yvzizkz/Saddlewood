import { describe, expect, it } from "vitest";

import { linkClocked, parseRunEmail, payDateFor, runEmail, runProblem, runSubject, sameName, startLines, type RunLine } from "../payrollRun";

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

  const clock = (name: string, hours: number, costCents: number | null) => ({ email: `${name.split(" ")[0].toLowerCase()}@crew`, name, hours, costCents });

  it("starts from the last run: amounts carry, the clock fills hours, and no one is added", () => {
    const new_ = clock("New Person", 8, 16_000);
    const fili = clock("Filiberto Villegas", 41.5, 100);
    const started = startLines([{ ...sub("Omar Peña", 339_000), note: "W9 attached" }, emp("Filiberto Villegas", 70.33), emp("Gone", 10)], [fili, new_]);
    expect(started).toEqual([sub("Omar Peña", 339_000), { ...emp("Filiberto Villegas", 41.5), email: fili.email }, emp("Gone", null)]);
    expect(linkClocked(started, [fili, new_]).unlinked).toEqual([new_]);
  });

  it("keeps a flat amount whatever the clock says, for anyone with a rate", () => {
    for (const name of ["Eli Lugo", "Omar Peña", "Cesar Olivares"]) {
      const [line] = startLines([sub(name, 300_000)], [clock(name, 2, 9_000)]);
      expect(line.amountCents).toBe(300_000);
      expect(line).not.toHaveProperty("lastCents");
    }
  });

  it("recomputes only a by-rate line, and shows what it was", () => {
    const hourly = { ...sub("Arnold Mujica", 148_925), byRate: true };
    const c = clock("Arnold Mujica", 30, 90_000);
    expect(startLines([hourly], [c])).toEqual([{ ...hourly, email: c.email, amountCents: 90_000, lastCents: 148_925 }]);
    expect(startLines([{ ...hourly, amountCents: 90_000 }], [c])[0]).not.toHaveProperty("lastCents");
    // Nothing on the clock is nothing to go on: Finance fills it in.
    expect(startLines([hourly], [])[0]).toMatchObject({ amountCents: null, lastCents: 148_925 });
    expect(startLines([hourly], [{ ...c, costCents: null }])[0].amountCents).toBeNull();
  });

  it("links a name through accents and case, and never pays one person twice", () => {
    const omar = { email: "omar@crew", name: "Omar Pena", hours: 2, costCents: 5_000 };
    const started = startLines([sub("Omar Peña", 339_000)], [omar]);
    expect(started).toEqual([{ ...sub("Omar Peña", 339_000), email: "omar@crew" }]);
    expect(linkClocked(started, [omar]).unlinked).toEqual([]);
    expect(sameName("  CÉSAR  Olivares ")).toBe(sameName("Cesar Olivares"));
  });

  it("flags a spelling it can't be sure of, and adds no line", () => {
    const arnoldo = { email: "arnold@crew", name: "Arnoldo Mujica", hours: 30, costCents: 96_000 };
    const started = startLines([sub("Arnold Mujica", 148_925)], [arnoldo]);
    expect(started).toEqual([sub("Arnold Mujica", 148_925)]);
    expect(linkClocked(started, [arnoldo]).unlinked).toEqual([arnoldo]);
  });

  it("goes by the saved link first, so the name can differ and two people with one name stay apart", () => {
    const arnoldo = { email: "arnold@crew", name: "Arnoldo Mujica", hours: 30, costCents: 96_000 };
    const line = { ...sub("Arnold Mujica", 148_925), email: "arnold@crew" };
    expect(linkClocked([line], [arnoldo])).toEqual({ matched: [arnoldo], unlinked: [] });
    const twin = { email: "other@crew", name: "Arnold Mujica", hours: 1, costCents: null };
    expect(linkClocked([line], [twin])).toEqual({ matched: [null], unlinked: [twin] });
  });

  it("refuses a line with no figure, a blank name and the same person twice", () => {
    expect(runProblem([])).toMatch(/at least one/);
    expect(runProblem([emp("A", null)])).toMatch(/A: fill in the hours/);
    expect(runProblem([sub("A", 0)])).toMatch(/A: fill in the amount/);
    expect(runProblem([sub(" ", 1)])).toMatch(/needs a name/);
    expect(runProblem([sub("A", 1), sub("a", 2)])).toMatch(/on the run twice/);
    expect(runProblem([sub("Omar Peña", 1), sub("Omar Pena", 2)])).toMatch(/on the run twice/);
    expect(runProblem([{ ...sub("Arnold Mujica", 1), email: "a@crew" }, { ...sub("Arnoldo Mujica", 2), email: "a@crew" }])).toMatch(/on the run twice/);
    expect(runProblem([sub("A", 1), emp("B", 2)])).toBeNull();
  });
});
