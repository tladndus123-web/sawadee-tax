import { describe, expect, it } from "vitest";
import { DEFAULT_FEES, feeRate, monthFees } from "./app-fees";

const sale = (date: string, channel: string, gross: number) => ({ date, channel, gross }) as { date: string; channel: "grab"; gross: number };

describe("delivery-app commission (GP)", () => {
  it("uses the company's own rate, else the usual one; nonsense falls back", () => {
    expect(feeRate({ grab: 25 }, "grab")).toBe(25);
    expect(feeRate({}, "lineman")).toBe(DEFAULT_FEES.lineman);
    expect(feeRate({ grab: 150 }, "grab")).toBe(DEFAULT_FEES.grab);
    expect(feeRate({ grab: "30" }, "grab")).toBe(DEFAULT_FEES.grab);
    expect(feeRate(null, "robinhood")).toBe(0);
  });

  it("GP 30% of 1,000 = 300, plus 7% VAT on it = 21 → 679 paid out", () => {
    const r = monthFees([sale("2026-09-01", "grab", 600), sale("2026-09-02", "grab", 400)], "2026-09", { grab: 30 });
    expect(r.lines).toEqual([{ channel: "grab", rate: 30, gross: 1000, fee: 300, feeVat: 21, payout: 679 }]);
    expect([r.fee, r.feeVat, r.payout]).toEqual([300, 21, 679]);
  });

  it("the shop's own till and other months are left out; apps are listed in a fixed order", () => {
    const r = monthFees(
      [sale("2026-09-01", "store", 5000), sale("2026-08-31", "grab", 900), sale("2026-09-03", "lineman", 100), sale("2026-09-03", "grab", 100)],
      "2026-09",
      {},
    );
    expect(r.lines.map((l) => l.channel)).toEqual(["grab", "lineman"]);
    expect(r.gross).toBe(200);
  });

  it("works in satang (no float drift)", () => {
    const r = monthFees([sale("2026-09-01", "grab", 333.33)], "2026-09", { grab: 30 });
    expect(r.lines[0]).toMatchObject({ fee: 100, feeVat: 7, payout: 226.33 });
  });
});
