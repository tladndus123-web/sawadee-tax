import { describe, expect, it } from "vitest";
import { linksOutside, outside } from "./line-links";

const APP = "https://thai-receipt-ledger.vercel.app";

describe("LINE: app links open in the phone's browser", () => {
  it("marks links to the app only, once, before a #fragment", () => {
    expect(outside(`${APP}/calendar`, APP)).toBe(`${APP}/calendar?openExternalBrowser=1`);
    expect(outside(`${APP}/ledger?m=2026-10#x`, APP)).toBe(`${APP}/ledger?m=2026-10&openExternalBrowser=1#x`);
    expect(outside(`${APP}/a?openExternalBrowser=1`, APP)).toBe(`${APP}/a?openExternalBrowser=1`);
    expect(outside("https://xyz.supabase.co/storage/v1/object/sign/x.xlsx?token=1", APP)).toBe("https://xyz.supabase.co/storage/v1/object/sign/x.xlsx?token=1");
    // a look-alike host is not the app
    expect(outside(`${APP}.evil.test/x`, APP)).toBe(`${APP}.evil.test/x`);
  });
  it("finds them in texts and card buttons at any depth", () => {
    const msg = {
      type: "flex",
      altText: "x",
      contents: { body: { contents: [{ action: { type: "uri", uri: `${APP}/expenses` } }, { action: { type: "uri", uri: "https://line.me/R/share?text=hi" } }] } },
    };
    const out = linksOutside(msg, APP);
    expect(out.contents.body.contents[0].action.uri).toBe(`${APP}/expenses?openExternalBrowser=1`);
    expect(out.contents.body.contents[1].action.uri).toBe("https://line.me/R/share?text=hi");
    expect(linksOutside({ type: "text", text: `Open ${APP}/calendar now.\n${APP}/` }, APP).text).toBe(`Open ${APP}/calendar?openExternalBrowser=1 now.\n${APP}/?openExternalBrowser=1`);
  });
});
