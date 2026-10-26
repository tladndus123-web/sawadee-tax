import { describe, expect, it } from "vitest";
import { cleanDates } from "./calendar-read-server";

describe("dates read from a document", () => {
  it("keeps valid dates with a title, drops past one-off dates, turns amounts into satang", () => {
    const out = cleanDates(
      {
        dates: [
          { title: "가게 임대 계약 만료", date: "2027-03-31", kind: "expiry", repeat: "none", amount: null, note: "Sukhumvit Property" },
          { title: "임대료", date: "2026-11-01", kind: "payment", repeat: "monthly", amount: 45000, note: "" },
          { title: "Old", date: "2025-01-01", kind: "expiry", repeat: "none", amount: null, note: "" },
          { title: "Licence", date: "2025-06-01", kind: "renewal", repeat: "yearly", amount: null, note: "" },
          { title: "", date: "2027-01-01", kind: "other", repeat: "none", amount: null, note: "" },
          { title: "Bad", date: "31/03/2027", kind: "weird", repeat: "x", amount: -1, note: "" },
        ],
      },
      "2026-10-28",
    );
    expect(out).toEqual([
      { title: "가게 임대 계약 만료", date: "2027-03-31", kind: "expiry", repeat: "none", amount: null, note: "Sukhumvit Property" },
      { title: "임대료", date: "2026-11-01", kind: "payment", repeat: "monthly", amount: 4500000, note: "" },
      { title: "Licence", date: "2025-06-01", kind: "renewal", repeat: "yearly", amount: null, note: "" },
    ]);
    expect(cleanDates(null, "2026-10-28")).toEqual([]);
  });
});
