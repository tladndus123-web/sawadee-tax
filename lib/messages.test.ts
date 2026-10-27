import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";

const strings = (o: unknown, path = ""): [string, string][] =>
  typeof o === "string" ? [[path, o]] : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k)) : [];

describe("screen words", () => {
  // In these messages an apostrophe right before {x} switches the placeholder off: the screen showed "{name}"
  // (found 2026-10-27). Quote names with “ ” or 「」 instead.
  it.each([
    ["ko", ko],
    ["ja", ja],
    ["th", th],
    ["en", en],
  ])("%s: no apostrophe right before a {placeholder}", (_l, m) => {
    expect(strings(m).filter(([, s]) => /'\{/.test(s)).map(([p]) => p)).toEqual([]);
  });
  it("every language has the same words", () => {
    const keys = (m: unknown) => strings(m).map(([p]) => p).sort();
    expect(keys(ja)).toEqual(keys(ko));
    expect(keys(th)).toEqual(keys(ko));
    expect(keys(en)).toEqual(keys(ko));
  });
});
