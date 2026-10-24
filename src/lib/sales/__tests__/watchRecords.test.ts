import { describe, expect, it } from "vitest";

import { recordChanges, type AgreementState, type DepositState, type RecordWatch } from "../watchRecords";

// The deposit watch closes from Money (cleanup Batch 3): paid in full closes
// it, a voided payment opens it again, and an owner's own tick or reopen is
// never overridden.

const JOB = "00000000-0000-4000-8000-000000000001";
const w = (over: Partial<RecordWatch>): RecordWatch => ({ id: 1, job_id: JOB, kind: "deposit", done_at: null, done_by: "", ...over });
const deposits = (paid: boolean) => new Map<string, DepositState>([[JOB, { number: "4821-01", paid }]]);

describe("recordChanges", () => {
  it("closes an open deposit watch once the deposit is paid in full, naming the invoice", () => {
    expect(recordChanges([w({})], deposits(true))).toEqual({ close: [{ id: 1, by: "record: 4821-01 paid in full" }], reopen: [] });
  });

  it("leaves it open while the deposit is unpaid or there is no deposit invoice", () => {
    expect(recordChanges([w({})], deposits(false))).toEqual({ close: [], reopen: [] });
    expect(recordChanges([w({})], new Map())).toEqual({ close: [], reopen: [] });
  });

  it("opens a record-closed watch again when the payment no longer stands", () => {
    const closed = w({ done_at: "2026-10-21T15:00:00Z", done_by: "record: 4821-01 paid in full" });
    expect(recordChanges([closed], deposits(false))).toEqual({ close: [], reopen: [1] });
    expect(recordChanges([closed], deposits(true))).toEqual({ close: [], reopen: [] });
  });

  it("leaves a record-closed watch closed when the deposit can't be found", () => {
    const closed = w({ done_at: "2026-10-21T15:00:00Z", done_by: "record: 4821-01 paid in full" });
    expect(recordChanges([closed], new Map())).toEqual({ close: [], reopen: [] });
  });

  it("never touches an owner's tick, even with the deposit unpaid", () => {
    const ticked = w({ done_at: "2026-10-21T15:00:00Z", done_by: "Marco" });
    expect(recordChanges([ticked], deposits(false))).toEqual({ close: [], reopen: [] });
  });

  it("leaves a watch an owner opened again open, even once paid", () => {
    expect(recordChanges([w({ done_by: "reopened by Marco" })], deposits(true))).toEqual({ close: [], reopen: [] });
  });

  it("only the deposit and agreement kinds close from the records", () => {
    expect(recordChanges([w({ kind: "agreement" }), w({ id: 2, kind: "prelim_notice" })], deposits(true))).toEqual({ close: [], reopen: [] });
    expect(recordChanges([w({ kind: "prelim_notice" })], deposits(true), agreements(true))).toEqual({ close: [], reopen: [] });
  });
});

// The agreement watch closes from the client's signature on the job's
// agreement (T130), the same way: a void agreement opens it again, an owner's
// own tick or reopen stands.
const agreements = (signed: boolean) => new Map<string, AgreementState>([[JOB, { number: "4821-AGR", signed }]]);
const a = (over: Partial<RecordWatch>) => w({ kind: "agreement", ...over });

describe("recordChanges, the agreement watch", () => {
  it("closes once the client signed the agreement, naming it", () => {
    expect(recordChanges([a({})], new Map(), agreements(true))).toEqual({ close: [{ id: 1, by: "record: 4821-AGR signed by the client" }], reopen: [] });
  });

  it("leaves it open while unsigned, or with no agreement on the job", () => {
    expect(recordChanges([a({})], new Map(), agreements(false))).toEqual({ close: [], reopen: [] });
    expect(recordChanges([a({})], new Map(), new Map())).toEqual({ close: [], reopen: [] });
  });

  it("a paid deposit never closes the agreement watch, nor a signature the deposit watch", () => {
    expect(recordChanges([a({})], deposits(true), new Map())).toEqual({ close: [], reopen: [] });
    expect(recordChanges([w({})], new Map(), agreements(true))).toEqual({ close: [], reopen: [] });
  });

  it("opens a record-closed watch again when the agreement is no longer signed (voided)", () => {
    const closed = a({ done_at: "2026-10-21T15:00:00Z", done_by: "record: 4821-AGR signed by the client" });
    expect(recordChanges([closed], new Map(), agreements(false))).toEqual({ close: [], reopen: [1] });
    expect(recordChanges([closed], new Map(), new Map())).toEqual({ close: [], reopen: [] });
  });

  it("never touches an owner's tick or an owner's reopen", () => {
    expect(recordChanges([a({ done_at: "2026-10-21T15:00:00Z", done_by: "Marco" })], new Map(), agreements(false))).toEqual({ close: [], reopen: [] });
    expect(recordChanges([a({ done_by: "reopened by Marco" })], new Map(), agreements(true))).toEqual({ close: [], reopen: [] });
  });
});
