import { describe, expect, it } from "vitest";

import { draftHeader, parseReply } from "../BotMarkdown";

describe("reading a bot reply", () => {
  it("splits the email-style sections", () => {
    const blocks = parseReply(
      [
        "## What you asked",
        "The Powell tracker for payment 10.",
        "",
        "## What I found",
        "- **Powell** is at 62% billed",
        "- Payment 9 cleared on 9/26",
        "",
        "## Next steps",
        "1. Review the draft",
        "2. Approve it",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "p", "heading", "ul", "heading", "ol"]);
    expect(blocks[3]).toEqual({ kind: "ul", items: ["**Powell** is at 62% billed", "Payment 9 cleared on 9/26"] });
  });

  it("keeps the line breaks of a text-style answer", () => {
    const blocks = parseReply("📝 Open drafts:\n#18 Powell payment 10 → mark@example.com\n#19 COI → office@mccully.example\n\nText \"approve 18\" to send one.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "p",
      lines: ["📝 Open drafts:", "#18 Powell payment 10 → mark@example.com", "#19 COI → office@mccully.example"],
    });
  });

  it("lifts the draft out as its own block, markdown inside left alone", () => {
    const blocks = parseReply(
      ["Here it is.", "=== DRAFT ===", "To: mark@example.com", "Subject: Progress payment 10", "", "Mark,", "", "- line one", "## not a header", "=== END DRAFT ===", "", "Say the word."].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["p", "draft", "p"]);
    const draft = blocks[1];
    if (draft.kind !== "draft") throw new Error("expected a draft");
    expect(draftHeader(draft.lines)).toEqual({
      to: "mark@example.com",
      subject: "Progress payment 10",
      body: "Mark,\n\n- line one\n## not a header",
    });
  });

  it("still shows a draft the bot forgot to close", () => {
    const blocks = parseReply("=== DRAFT ===\nTo: a@b.com\nSubject: Hi\n\nBody");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("draft");
  });
});
