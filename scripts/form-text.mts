// Writes lib/form-text.json: the few parts of messages/{th,en,ja}.json that the printed forms need in the *form*
// languages (labels, docType, copyKind, signed / not signed, the Thai input-tax report headings). Browser code imports
// this small file instead of the whole message files (speed, 2026-11-09: three full languages were in every page's
// JavaScript). lib/form-text.test.ts fails when it is out of date — run: npx.cmd tsx scripts/form-text.mts

import { readFileSync, writeFileSync } from "node:fs";
import { formText } from "../lib/form-text-pick";

const read = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8"));
const out = formText({ th: read("th"), en: read("en"), ja: read("ja") });
writeFileSync(new URL("../lib/form-text.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("lib/form-text.json written");
