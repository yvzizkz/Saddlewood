import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agreementText, longDate, money0, money2, num, round2, type AgreementParams } from "../text";

// The agreement's words are contract.py's, to the character (owner, 2026-10-22:
// port verbatim, no wording changes until counsel reads it). Where the KB is
// on this machine, contract.py itself writes each case and the two are
// compared; the KB file is only read.

const KB = process.env.SADDLEWOOD_KB ?? join(homedir(), "dev", "Saddlewood-KB");
const CONTRACT_PY = join(KB, "bot", "contract.py");

function fromPython(params: AgreementParams, policies: Record<string, unknown>): string {
  const py = {
    contract_number: params.contractNumber,
    type: params.type ?? "prime_residential",
    client_name: params.clientName,
    client_entity: params.clientEntity,
    project_name: params.projectName,
    project_address: params.projectAddress,
    amount: params.amount,
    scope: params.scope,
    scope_details: params.scopeDetails,
    date: params.date,
    ...(params.warrantyYears !== undefined ? { warranty_years: params.warrantyYears } : {}),
  };
  const script = [
    "import importlib.util, json, sys",
    "spec = importlib.util.spec_from_file_location('contract', sys.argv[1])",
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
    "a = json.loads(sys.argv[2])",
    "p = {k: v for k, v in a['params'].items() if v is not None}",
    "sys.stdout.write(m.generate_contract_text(p, a['policies']))",
  ].join("\n");
  return execFileSync("python3", ["-I", "-c", script, CONTRACT_PY, JSON.stringify({ params: py, policies })], { encoding: "utf8" });
}

const CASES: [string, AgreementParams, Record<string, unknown>][] = [
  [
    "recommended policies",
    { contractNumber: "3526-AGR", clientName: "Mark & Heather Powell", projectName: "3526 Emerson Street", projectAddress: "3526 Emerson St, Phoenix, AZ", amount: 420000, scope: "Framing & Drywall", scopeDetails: "- Framing\n- Drywall", date: "October 03, 2026" },
    {},
  ],
  [
    "owner-set policies (non-refundable, from the invoice date, bill-later extras)",
    { contractNumber: "8009-AGR-2", type: "prime_commercial", clientName: "A Finer Touch Construction", clientEntity: "AFT LLC", projectName: "8009 N Ironwood Dr", projectAddress: "8009 N Ironwood Dr", amount: 24850.55, scope: "Remodel", date: "January 15, 2027" },
    { "policy.deposit.pct": 25, "policy.deposit.specialOrders": false, "policy.deposit.refund": "non_refundable", "policy.late.start": "invoice_date", "policy.late.graceDays": 5, "policy.late.ratePct": 1.25, "policy.extras.under": "log_only", "policy.extras.markupPct": 15, "policy.extras.coFromCents": 250000, "policy.extras.halfAtSigningFromCents": 1000000 },
  ],
  [
    "subcontract, odd cents, fractional rate",
    { contractNumber: "X-1", type: "subcontractor", clientName: "Schifferer Built LLC", projectName: "Bellevue", projectAddress: "9146 W Hutton Dr", amount: 1234.56, scope: "Drywall", date: "March 01, 2027", warrantyYears: 3 },
    { "policy.deposit.pct": 12.5, "policy.late.ratePct": 0.1, "policy.deposit.cancelPct": 7.5 },
  ],
];

describe("the agreement's words", () => {
  it.skipIf(!existsSync(CONTRACT_PY)).each(CASES)("match contract.py to the character: %s", (_name, params, policies) => {
    expect(agreementText(params, policies)).toBe(fromPython(params, policies));
  });

  it("formats numbers the way Python does", () => {
    expect([num(1.5), num(18), num(10), num(1.2000000000000002), num(12.5)]).toEqual(["1.5", "18", "10", "1.2", "12.5"]);
    expect([money2(420000), money2(1234.5), money2(0)]).toEqual(["420,000.00", "1,234.50", "0.00"]);
    expect(money0(1000)).toBe("1,000");
    expect([round2(0.125), round2(0.375), round2(4500.05)]).toEqual([0.12, 0.38, 4500.05]);
    expect(longDate("2026-10-03")).toBe("October 03, 2026");
  });

  it("carries the price, the scope and the policy terms", () => {
    const t = agreementText({ contractNumber: "N-1", clientName: "Pat", amount: 50000, scope: "Kitchen", date: "October 23, 2026" }, { "policy.deposit.pct": 20 });
    expect(t).toContain("**$50,000.00**");
    expect(t).toContain("**$10,000.00** (20% of the Contract Price)");
    expect(t).toContain("> **Kitchen**");
    expect(t.startsWith("# PRIME RESIDENTIAL CONSTRUCTION AGREEMENT")).toBe(true);
  });
});
