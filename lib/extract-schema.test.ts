import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { extractedToRaw, extractSchema } from "./extract-schema";
import { normalize } from "./normalize";

// The hand-checked sample is exactly what a perfect AI reading looks like.
const reading = {
  ...sample,
  notDocument: false,
  fieldBoxes: [
    { path: "customer.name", box: [0.075, 0.258, 0.15, 0.022] },
    { path: "bad.box", box: [0.1, 0.2] },
  ],
};

describe("AI reading schema", () => {
  it("accepts the hand-checked sample document", () => {
    const parsed = extractSchema.safeParse(reading);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("normalizes to the same document as the sample", () => {
    const doc = normalize(extractedToRaw(extractSchema.parse(reading)));
    // Boxes with the wrong number of values are dropped
    expect(doc.fieldBoxes).toEqual({ "customer.name": [0.075, 0.258, 0.15, 0.022] });
    expect({ ...doc, fieldBoxes: {} }).toEqual({ ...normalize(sample), fieldBoxes: {} });
  });
});
