import { describe, expect, it } from "vitest";

import { firstNote } from "../format";

describe("firstNote", () => {
  it("is everything the lead sent, or the row's detail without it", () => {
    expect(firstNote({ summary: "Message: Hi", detail: "Website · Kitchen" })).toBe("Message: Hi");
    expect(firstNote({ detail: "Website · Kitchen" })).toBe("Website · Kitchen");
    expect(firstNote({ summary: "", detail: "" })).toBeUndefined();
  });

  it("fits the 4,000 a note can hold, and shows it was cut", () => {
    const note = firstNote({ summary: "x".repeat(8000), detail: "" })!;
    expect(note).toHaveLength(4000);
    expect(note.endsWith("…")).toBe(true);
    expect(firstNote({ summary: "x".repeat(4000), detail: "" })).toBe("x".repeat(4000));
  });
});
