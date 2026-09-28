import { describe, expect, it } from "vitest";
import { bangkokMonth, monthRange, teamSummary, type TeamEvent } from "./team-summary";

const ev = (userId: string | null, action: TeamEvent["action"], at: string, documentId = "d1"): TeamEvent => ({ userId, action, at, documentId });

describe("who did what this month", () => {
  it("months follow Bangkok time", () => {
    expect(bangkokMonth("2026-09-30T18:30:00Z")).toBe("2026-10"); // 01:30 on 1 Oct in Bangkok
    expect(monthRange("2026-10")).toEqual({ from: "2026-09-30T17:00:00.000Z", to: "2026-10-31T17:00:00.000Z" });
  });

  it("counts per person; several saves of one document are one edit; system edits are left out", () => {
    const rows = teamSummary(
      [
        ev("a", "create", "2026-09-10T03:00:00Z", "d1"),
        ev("a", "create", "2026-09-11T03:00:00Z", "d2"),
        ev("a", "update", "2026-09-12T03:00:00Z", "d1"),
        ev("a", "update", "2026-09-12T04:00:00Z", "d1"),
        ev("b", "update", "2026-09-13T03:00:00Z", "d2"),
        ev("b", "delete", "2026-09-14T03:00:00Z", "d3"),
        ev(null, "update", "2026-09-15T03:00:00Z", "d1"),
        ev("a", "create", "2026-08-31T03:00:00Z", "d9"), // another month
      ],
      [{ ackBy: "b", ackAt: "2026-09-16T03:00:00Z" }, { ackBy: null, ackAt: null }],
      "2026-09",
    );
    expect(rows).toEqual([
      { userId: "a", created: 2, edited: 1, deleted: 0, restored: 0, acked: 0, lastAt: "2026-09-12T04:00:00Z" },
      { userId: "b", created: 0, edited: 1, deleted: 1, restored: 0, acked: 1, lastAt: "2026-09-16T03:00:00Z" },
    ]);
  });
});
