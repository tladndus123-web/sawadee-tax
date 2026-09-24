import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { compareDocs } from "./extract-eval";
import { normalize } from "./normalize";

const truth = normalize(sample);

describe("accuracy scoring", () => {
  it("scores the answer against itself as perfect", () => {
    const r = compareDocs(truth, truth);
    expect(r.score.all.ok).toBe(r.score.all.total);
    expect(r.score.exact.total).toBeGreaterThan(30);
    expect(r.score.thai.total).toBeGreaterThan(10);
  });

  it("ignores spacing in Thai and case/punctuation in English, but not in numbers", () => {
    const got = normalize({
      ...sample,
      seller: { ...sample.seller, name: { ...sample.seller.name, th: sample.seller.name.th.replace(/ /g, "  "), en: "panfood co ltd" } },
      totals: { ...sample.totals, vat: 4200.01 },
    });
    const r = compareDocs(truth, got);
    const miss = r.fields.filter((f) => !f.ok).map((f) => f.path);
    expect(miss).toEqual(["totals.vat"]);
  });

  it("counts a missing item line as misses", () => {
    const r = compareDocs(truth, normalize({ ...sample, items: [] }));
    expect(r.fields.find((f) => f.path === "items.0.amount")?.ok).toBe(false);
  });
});
