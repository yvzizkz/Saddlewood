import { describe, expect, it } from "vitest";

import { generateContractText } from "../generator";

// The company as it appears everywhere else (the KB: ROC 305762 in 15,784
// documents, 338944/338945 in none; Marco Cravioto; the office line).
describe("generateContractText", () => {
  it("names Saddlewood's real license, office line and signer", () => {
    const t = generateContractText({ client_name: "Test Client", amount: 20000 });
    expect(t).toContain("ROC #305762");
    expect(t).toContain("(480) 999-6100");
    expect(t).toContain("Name: Marco Cravioto");
    expect(t).not.toMatch(/338944|338945|Marco Ochoa|218-1191/);
  });
});
