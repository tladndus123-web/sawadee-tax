import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { redirectLabel, staysOnDevice } from "./redirect-label";

describe("the address shown on the agent sign-in page", () => {
  it("names the host a website code goes to, whatever the client calls itself", () => {
    expect(redirectLabel("https://evil.example/cb?x=1")).toBe("evil.example");
    expect(redirectLabel("https://user:pw@evil.example:8443/cb")).toBe("evil.example");
    expect(staysOnDevice("https://evil.example/cb")).toBe(false);
  });
  it("loopback and app links stay on the device", () => {
    expect(redirectLabel("http://127.0.0.1:53682/callback")).toBe("127.0.0.1");
    expect(staysOnDevice("http://127.0.0.1:53682/callback")).toBe(true);
    expect(redirectLabel("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("cursor://");
    expect(staysOnDevice("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(staysOnDevice("http://evil.example/cb")).toBe(false);
  });
  it("is empty for nonsense", () => {
    expect(redirectLabel("not a url")).toBe("");
    expect(staysOnDevice("not a url")).toBe(false);
  });
  it("the consent page shows it", () => {
    const src = readFileSync("components/settings/ConnectConsent.tsx", "utf8");
    expect(src).toContain("redirectLabel(req.redirect_uri)");
    expect(src).toContain('t("sendsTo"');
  });
});
