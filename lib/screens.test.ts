import { describe, expect, it } from "vitest";
import { canOpen, cleanScreens, screenOf } from "./screens";

describe("screens", () => {
  it("maps paths to screens (documents belong to the ledger)", () => {
    expect(screenOf("/ko")).toBeNull();
    expect(screenOf("/ja/")).toBeNull();
    expect(screenOf("/th/ledger")).toBe("ledger");
    expect(screenOf("/en/documents/abc")).toBe("ledger");
    expect(screenOf("/ko/payroll")).toBe("payroll");
    expect(screenOf("/ko/settings")).toBe("settings");
    expect(screenOf("/ko/salesx")).toBeNull();
  });
  it("limits only plain admins with a list", () => {
    const admin = { role: "admin", owner: false, screens: ["sales"] };
    expect(canOpen(admin, "sales")).toBe(true);
    expect(canOpen(admin, "payroll")).toBe(false);
    expect(canOpen(admin, null)).toBe(true);
    expect(canOpen({ ...admin, owner: true }, "payroll")).toBe(true);
    expect(canOpen({ ...admin, screens: null }, "payroll")).toBe(true);
    expect(canOpen({ role: "staff", owner: false, screens: ["sales"] }, "ledger")).toBe(true);
  });
  it("keeps only known screens", () => {
    expect(cleanScreens(null)).toBeNull();
    expect(cleanScreens(["payroll", "x", "ledger"])).toEqual(["ledger", "payroll"]);
  });
});
