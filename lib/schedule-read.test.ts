import { describe, expect, it } from "vitest";
import { cellsToSave, cleanSheet, mergeSheets } from "./schedule-read";

const staff = [
  { id: "e1", name: "Somchai Jaidee", nickname: "Nok" },
  { id: "e2", name: "Art Wong", nickname: "" },
];

describe("cleanSheet", () => {
  it("turns day codes into cells and matches people by number or name", () => {
    const r = cleanSheet(
      {
        month: "2026-12",
        blankIsWork: false,
        people: [
          { n: 1, name: "น้อง Nok", days: ["W", "W+2", "o", "", "A", "S", "X", "?", "W+1.5"] },
          { n: 0, name: "art", days: ["O"] },
          { n: 0, name: "Mint", days: ["W"] },
        ],
      },
      "2026-11",
      staff,
    );
    expect(r.month).toBe("2026-12");
    expect(r.people[0].employeeId).toBe("e1");
    expect(r.people[0].cells).toEqual([
      { day: "2026-12-01", kind: "work", otHours: 0 },
      { day: "2026-12-02", kind: "work", otHours: 2 },
      { day: "2026-12-03", kind: "off", otHours: 0 },
      { day: "2026-12-05", kind: "annual", otHours: 0 },
      { day: "2026-12-06", kind: "sick", otHours: 0 },
      { day: "2026-12-07", kind: "absent", otHours: 0 },
      { day: "2026-12-09", kind: "work", otHours: 1.5 },
    ]);
    expect(r.people[1].employeeId).toBe("e2"); // "art" = first name of Art Wong
    expect(r.people[2].employeeId).toBeNull(); // not on the staff list: the person picks
  });
  it("keeps the tab's month when the sheet shows none, never gives one employee twice, and stops at the month's end", () => {
    const r = cleanSheet({ month: "", people: [{ n: 1, name: "Nok", days: Array(31).fill("W") }, { n: 1, name: "Nok?", days: [] }] }, "2026-11", staff);
    expect(r.month).toBe("2026-11");
    expect(r.people[0].cells).toHaveLength(30);
    expect(r.people[1].employeeId).toBeNull();
  });
});

describe("mergeSheets and cellsToSave", () => {
  it("joins two halves of a month and fills blank days as work when the sheet marks only days off", () => {
    const a = cleanSheet({ month: "2026-11", people: [{ n: 1, name: "Nok", days: ["O", ""] }] }, "2026-11", staff);
    const b = cleanSheet({ month: "2026-11", blankIsWork: true, people: [{ n: 1, name: "Nok", days: ["", "", "A"] }] }, "2026-11", staff);
    const m = mergeSheets([a, b])!;
    expect(m.people).toHaveLength(1);
    expect(m.blankIsWork).toBe(true);
    const save = cellsToSave(m.people[0], m.month, true, { startDate: "2026-11-01", endDate: "2026-11-10" });
    expect(save).toHaveLength(10);
    expect(save.slice(0, 3).map((c) => c.kind)).toEqual(["off", "work", "annual"]);
    expect(cellsToSave(m.people[0], m.month, false, {})).toHaveLength(2);
  });
});
