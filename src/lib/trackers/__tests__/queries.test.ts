import { describe, expect, it } from "vitest";

import { isTrackerState } from "../queries";

describe("the tracker list", () => {
  it("lists real trackers and leaves out the prototypes' rows kept in the same table", () => {
    expect(isTrackerState({ lines: [], project: {} })).toBe(true);
    expect(isTrackerState({ expenses: [], activeProjects: [] })).toBe(false); // accounting-state
    expect(isTrackerState({ contracts: [] })).toBe(false); // contracts-state
    expect(isTrackerState(null)).toBe(false);
  });
});
