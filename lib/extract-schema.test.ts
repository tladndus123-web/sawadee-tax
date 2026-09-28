import { describe, expect, it } from "vitest";
import sample from "@/docs/reference/sample-document.json";
import { extractedToRaw, extractSchema, MAX_PHOTOS, MAX_QUEUE, parseReply } from "./extract-schema";
import { normalize } from "./normalize";
import { sampleDoc } from "./sample";

// The hand-checked sample is exactly what a perfect AI reading looks like.
const reading = {
  ...sample,
  seller: { ...sample.seller, branch: { th: "สำนักงานใหญ่", en: "Head office", ja: "本社" } },
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
    // The warehouse number is no longer read (removed 2026-09-29): it comes back empty
    const want = sampleDoc();
    expect({ ...doc, fieldBoxes: {} }).toEqual({ ...want, items: want.items.map((i) => ({ ...i, wh: "" })), fieldBoxes: {} });
  });
});

describe("reading the reply", () => {
  it("finds the JSON object around fences or prose", () => {
    expect(parseReply('```json\n{"docNo":"A1"}\n```')).toEqual({ docNo: "A1" });
    expect(parseReply('Here it is: {"notDocument": true}')).toEqual({ notDocument: true });
    expect(parseReply("no json")).toBeNull();
    expect(parseReply("{broken")).toBeNull();
  });
});

describe("MaxNotice", () => {
  it("shows the same limit as the upload queue", async () => {
    const src = (await import("node:fs")).readFileSync("components/upload/MaxNotice.tsx", "utf8");
    expect(src).toContain(`const AT_ONCE = ${MAX_PHOTOS};`);
    expect(src).toContain(`const MAX_QUEUE = ${MAX_QUEUE};`);
  });
});
