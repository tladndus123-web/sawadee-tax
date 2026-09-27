import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// pdf.js refuses a worker from another version, so the copy in /public must match the installed package.
// After updating pdfjs-dist: cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/
describe("pdf.js worker copy", () => {
  it("matches the installed pdfjs-dist", () => {
    const installed = readFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
    const copy = readFileSync("public/pdfjs/pdf.worker.min.mjs");
    expect(copy.equals(installed)).toBe(true);
  });
});
