import { describe, expect, it } from "vitest";
import { activeHref, groupNav, navTrail, NAV_ITEMS, nextSidebarPref, readSidebarPref, sidebarChrome, sidebarLabeled, visibleItems } from "./nav-menu";

const admin = { role: "admin", owner: false, screens: null, loaded: true };
const staff = { role: "staff", owner: false, screens: null, loaded: true };

describe("the menu", () => {
  it("shows only the dashboard until we know who this is", () => {
    expect(visibleItems({ ...admin, loaded: false }).map((i) => i.key)).toEqual(["dashboard"]);
  });
  it("keeps admin screens from staff and extras off until switched on", () => {
    const s = visibleItems(staff).map((i) => i.key);
    expect(s).toContain("ledger");
    expect(s).not.toContain("payroll");
    expect(s).not.toContain("taxes");
    expect(s).not.toContain("waste");
    expect(visibleItems(admin, ["waste"]).map((i) => i.key)).toContain("waste");
  });
  it("follows an owner's screen list for an admin", () => {
    const limited = visibleItems({ ...admin, screens: ["ledger"] }).map((i) => i.key);
    expect(limited).toContain("ledger");
    expect(limited).toContain("payables"); // under /ledger
    expect(limited).not.toContain("taxes"); // the tax hub reads sales too
    expect(limited).not.toContain("contracts"); // owners and unlimited admins only
    expect(visibleItems(admin).map((i) => i.key)).toContain("contracts");
    expect(visibleItems({ ...admin, kept: 1 }).map((i) => i.key)).not.toContain("contracts");
    expect(visibleItems({ ...admin, owner: true, screens: ["ledger"] }).map((i) => i.key)).toContain("contracts");
    expect(limited).not.toContain("sales");
    expect(limited).not.toContain("payroll");
  });
  it("groups in the sidebar order and drops empty groups", () => {
    expect(groupNav(visibleItems(staff)).map((g) => g.group)).toEqual(["home", "books", "trade", "people", "settings"]);
    expect(groupNav(NAV_ITEMS.filter((i) => i.group === "books")).map((g) => g.group)).toEqual(["books"]);
  });
  it("lights the most specific item", () => {
    const items = visibleItems(admin);
    expect(activeHref(items, "/")).toBe("/");
    expect(activeHref(items, "/ledger")).toBe("/ledger");
    expect(activeHref(items, "/ledger/cash")).toBe("/ledger/cash");
    expect(activeHref(items, "/ledger/filing/2026-10")).toBe("/ledger/taxes");
    expect(activeHref(items, "/documents/abc")).toBe("/ledger");
    expect(activeHref(items, "/vendors/prices")).toBe("/vendors/prices");
    expect(activeHref(items, "/ledgerx")).toBeUndefined();
  });
  it("makes the top bar trail", () => {
    const items = visibleItems(admin);
    expect(navTrail(items, "/")).toBeNull();
    expect(navTrail(items, "/sales")).toEqual({ group: "trade", key: "sales", href: "/sales", detail: false });
    expect(navTrail(items, "/documents/abc")).toMatchObject({ key: "ledger", detail: true });
  });
});

describe("the sidebar width", () => {
  it("is narrow below 1280 by default and wide from 1280", () => {
    expect(sidebarLabeled("auto", 1100)).toBe(false);
    expect(sidebarLabeled("auto", 1440)).toBe(true);
    expect(sidebarLabeled("open", 900)).toBe(false); // tablets always narrow
    expect(sidebarLabeled("open", 1100)).toBe(true);
    expect(sidebarLabeled("closed", 1600)).toBe(false);
  });
  it("puts the right marks on the page", () => {
    expect(sidebarChrome("auto", 1440)).toEqual({ sidebar: null, rail: false });
    expect(sidebarChrome("closed", 1440)).toEqual({ sidebar: "closed", rail: true });
    expect(sidebarChrome("auto", 500).rail).toBe(false); // phones have no sidebar
  });
  it("reads the stored choice and flips it", () => {
    expect(readSidebarPref("open")).toBe("open");
    expect(readSidebarPref("weird")).toBe("auto");
    expect(nextSidebarPref(true)).toBe("closed");
    expect(nextSidebarPref(false)).toBe("open");
  });
});
