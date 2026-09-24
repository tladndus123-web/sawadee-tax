import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { docSchema } from "./doc-schema";
import { normalize } from "./normalize";

const withSigns = (signs: Record<string, unknown>) => normalize({ ...sample, signs: { ...sample.signs, ...signs } });

describe("typed signatures", () => {
  it("default to empty and keep the AI's signed marks", () => {
    const d = normalize(sample);
    expect(d.signs).toMatchObject({ receiverSign: "", issuerSign: "", delivererSign: "" });
    expect(docSchema.safeParse(d).success).toBe(true);
  });

  it("a typed signature counts as signed", () => {
    const d = withSigns({ receiver: false, issuer: false, deliverer: null, receiverSign: " Somchai ", delivererSign: "สมชาย" });
    expect(d.signs.receiver).toBe(true);
    expect(d.signs.receiverSign).toBe("Somchai");
    expect(d.signs.issuer).toBe(false);
    expect(d.signs.deliverer).toEqual({ th: "", en: "", ja: "" });
  });

  it("caps a typed signature at 60 characters", () => {
    expect(withSigns({ issuerSign: "x".repeat(80) }).signs.issuerSign).toHaveLength(60);
  });
});
