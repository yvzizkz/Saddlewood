import { describe, expect, it } from "vitest";

import { dropsDetail } from "../jobClient";

const job = (over: Partial<{ contact_id: string | null; client_email: string | null; client_phone: string | null }> = {}) => ({ contact_id: null, client_email: "", client_phone: "", ...over });

describe("dropsDetail", () => {
  it("lets a first contact fill an empty job", () => {
    expect(dropsDetail(job(), { email: "", phone: "" })).toBeNull();
    expect(dropsDetail(job({ client_email: null, client_phone: null }), { email: "a@x.com", phone: "" })).toBeNull();
  });
  it("won't let a first contact wipe what the job has", () => {
    expect(dropsDetail(job({ client_email: "a@x.com" }), { email: " ", phone: "602" })).toBe("email");
    expect(dropsDetail(job({ client_phone: "602" }), { email: "a@x.com", phone: "" })).toBe("phone");
  });
  it("keeps a job whose details the contact has", () => {
    expect(dropsDetail(job({ client_email: "a@x.com", client_phone: "602" }), { email: "b@x.com", phone: "480" })).toBeNull();
  });
  it("drops the last person's details when the job moves to another contact", () => {
    expect(dropsDetail(job({ contact_id: "c1", client_email: "a@x.com", client_phone: "602" }), { email: "", phone: "" })).toBeNull();
  });
});
