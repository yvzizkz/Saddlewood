import { beforeEach, describe, expect, it, vi } from "vitest";

// The site's agreement generator is retired (T112): the three seed rows keep
// the words it wrote for them, frozen in seedTexts.ts, and a drafted
// agreement's terms no longer change on the old page (its words would stop
// matching). The KB's contracts_state.json is never touched here: fs is a stand-in.

const { saved, written } = vi.hoisted(() => ({ saved: { state: null as unknown }, written: [] as string[] }));
vi.mock("fs", () => {
  const fs = { existsSync: () => false, readFileSync: () => "", writeFileSync: (p: string) => written.push(p), mkdirSync: () => undefined };
  return { ...fs, default: fs };
});
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved.state ? { state: saved.state } : null }) }) }),
      upsert: async (row: { state: unknown }) => {
        saved.state = row.state;
        return { error: null };
      },
    }),
  }),
}));

import { SEED_TEXTS } from "../seedTexts";
import { ContractTermsError, getContractsState, updateContract } from "../store";

beforeEach(() => {
  saved.state = null;
  written.length = 0;
});

describe("the seed agreements", () => {
  it("keep their frozen words, with Saddlewood's real license, office line and signer", async () => {
    expect(Object.keys(SEED_TEXTS)).toEqual(["SWC-2026-001", "SWC-2026-002", "SWC-2026-003"]);
    for (const t of Object.values(SEED_TEXTS)) {
      expect(t).toContain("ROC #305762");
      expect(t).toContain("(480) 999-6100");
      expect(t).toContain("Name: Marco Cravioto");
      expect(t).not.toMatch(/338944|338945|Marco Ochoa|218-1191/);
    }
    expect(SEED_TEXTS["SWC-2026-001"]).toContain("**Effective Date:** September 24, 2026");
    const { contracts } = await getContractsState();
    expect(contracts.map((c) => c.contract_text)).toEqual(Object.values(SEED_TEXTS));
  });
});

describe("updateContract", () => {
  it("moves a status, and refuses to change the terms its words were written from", async () => {
    const signed = await updateContract("cnt-001", { status: "signed" }, "Marco");
    expect(signed).toMatchObject({ status: "signed", signed_by: "Marco", contract_text: SEED_TEXTS["SWC-2026-001"] });
    await expect(updateContract("cnt-001", { amount: 1, scope: "Other" }, "Marco")).rejects.toThrow(ContractTermsError);
    await expect(updateContract("cnt-001", { amount: 1 }, "Marco")).rejects.toThrow("amount can't change on a drafted agreement; draft it again on the job");
    // Sending a term back unchanged is not a change.
    expect(await updateContract("cnt-001", { amount: 45000, status: "sent" }, "Marco")).toMatchObject({ status: "sent", amount: 45000 });
    expect(written.every((p) => p.endsWith("contracts_state.json"))).toBe(true);
  });
});
