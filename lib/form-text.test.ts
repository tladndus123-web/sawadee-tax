import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import th from "@/messages/th.json";
import { formText } from "./form-text-pick";
import small from "./form-text.json";

describe("lib/form-text.json (the form labels the browser loads instead of the whole message files)", () => {
  it("matches messages/{th,en,ja}.json — if not: npx.cmd tsx scripts/form-text.mts", () => {
    expect(small).toEqual(formText({ th, en, ja } as never));
  });
});
