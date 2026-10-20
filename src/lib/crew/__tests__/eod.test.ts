import { describe, expect, it } from "vitest";

import { eodDone, eodField } from "../eod";

// An end of day typed, said, or both: typed words win, the memo fills the blanks.

const typed = { body: "North wall framed", data: { stuck: "Waiting on the inspector", needs: "", asked: "", safety: "" }, bot: {} };
const said = {
  body: "",
  data: { stuck: "", needs: "", asked: "", deliveries: "", safety: "" },
  bot: {
    transcript: "We framed the north wall, we are stuck on the inspector, need 2x6 for tomorrow, and the super asked for a soffit.",
    fields: { done: "Framed the north wall", stuck: "The inspector", needs: "2x6 for tomorrow", asked: "A soffit for the super" },
    fieldsLang: "en",
  },
};

describe("what an end of day says", () => {
  it("shows the typed text as it was", () => {
    expect(eodDone(typed)).toBe("North wall framed");
    expect(eodField(typed, "stuck")).toBe("Waiting on the inspector");
    expect(eodField(typed, "needs")).toBe("");
  });

  it("falls back to what the memo said where nothing was typed", () => {
    expect(eodDone(said)).toBe("Framed the north wall");
    expect(eodField(said, "stuck")).toBe("The inspector");
    expect(eodField(said, "needs")).toBe("2x6 for tomorrow");
    expect(eodField(said, "asked")).toBe("A soffit for the super");
  });

  it("lets typed words win over the memo, field by field", () => {
    const both = { ...said, body: "Typed it", data: { ...said.data, needs: "Nails" } };
    expect(eodDone(both)).toBe("Typed it");
    expect(eodField(both, "needs")).toBe("Nails");
    expect(eodField(both, "stuck")).toBe("The inspector");
  });

  it("never fills the yes/no fields from the memo, and shrugs off a bad shape", () => {
    expect(eodField(said, "safety")).toBe("");
    expect(eodField(said, "deliveries")).toBe("");
    expect(eodDone({ body: "", bot: { fields: "nope" } })).toBe("");
    expect(eodDone({ body: "", bot: { fields: ["done"] } })).toBe("");
    expect(eodDone({ body: "", bot: { fields: { done: 7 } } })).toBe("");
    expect(eodDone({ body: "", bot: { fields: { done: "   " } } })).toBe("");
    expect(eodDone({ body: "", bot: {} })).toBe("");
  });
});
