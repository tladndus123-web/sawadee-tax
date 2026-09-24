// Accuracy check for AI reading (PROMPT step 6): reads the sample photo for real and compares every field
// with the hand-checked answer. Uses lib/extract-server.ts, i.e. exactly what /api/extract does.
//
//   npm run eval:extract                      # sample photo, model/effort from .env.local
//   npm run eval:extract -- --effort high     # try another effort
//   npm run eval:extract -- --runs 3          # repeat to see how stable the reading is
//
// Needs ANTHROPIC_API_KEY in .env.local. Each run is one paid API call. Results: eval-results/*.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { runChecks } from "../lib/checks";
import { compareDocs, type EvalReport } from "../lib/extract-eval";
import { extractDocument, type ImageType } from "../lib/extract-server";
import { normalize } from "../lib/normalize";
import { sampleDoc } from "../lib/sample";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const photoPath = arg("photo") ?? "docs/reference/sample-panfood-invoice.jpg";
const answerPath = arg("answer");
const runs = Math.max(1, Math.min(5, Number(arg("runs") ?? 1)));
const effort = arg("effort") as "low" | "medium" | "high" | "xhigh" | "max" | undefined;
const model = arg("model");

// Claude Opus 5.5 list price per million tokens (update if the model changes)
const PRICE = { input: 4, output: 20 };

const pct = (s: { ok: number; total: number }) => `${s.ok}/${s.total} (${s.total ? Math.round((s.ok / s.total) * 100) : 0}%)`;

async function main() {
  const type: ImageType = /\.png$/i.test(photoPath) ? "image/png" : /\.webp$/i.test(photoPath) ? "image/webp" : "image/jpeg";
  const image = readFileSync(photoPath);
  // Default answer: the hand-checked sample (with the seller's head office the reference JSON predates)
  const truth = answerPath ? normalize(JSON.parse(readFileSync(answerPath, "utf8"))) : sampleDoc();
  const results: { run: number; ms: number; tokens: [number, number]; report: EvalReport; flags: string[]; unclear: string[]; schemaIssues: string[] }[] = [];

  for (let run = 1; run <= runs; run++) {
    process.stdout.write(`Run ${run}/${runs}: reading ${path.basename(photoPath)} … `);
    const out = await extractDocument(image, type, { effort, model });
    if (!out.ok) {
      console.log(`failed: ${out.code}${out.detail ? ` — ${out.detail}` : ""}`);
      if (out.code === "noKey") console.log("Put ANTHROPIC_API_KEY=... in .env.local (see .env.example).");
      process.exitCode = 1;
      return;
    }
    const report = compareDocs(truth, out.doc);
    const flags = runChecks(out.doc).filter((c) => !c.ok && !c.na).map((c) => c.key);
    results.push({ run, ms: out.ms, tokens: [out.inputTokens, out.outputTokens], report, flags, unclear: out.doc.unclear, schemaIssues: out.schemaIssues });
    console.log(`${(out.ms / 1000).toFixed(1)}s · ${out.model} · effort ${out.effort}`);

    const s = report.score;
    console.log(`  All      ${pct(s.all)}`);
    console.log(`  Exact    ${pct(s.exact)}   numbers · codes · dates · choices`);
    console.log(`  Thai     ${pct(s.thai)}   printed Thai text (spaces ignored)`);
    console.log(`  English  ${pct(s.english)}   English names / addresses (case & punctuation ignored)`);
    const miss = report.fields.filter((f) => !f.ok);
    if (miss.length) {
      console.log("  Mismatches:");
      for (const f of miss) console.log(`   ✗ ${f.path}\n       expected: ${f.expected || "(empty)"}\n       got:      ${f.got || "(empty)"}`);
    }
    console.log(`  AI marked unclear: ${out.doc.unclear.join(", ") || "none"}`);
    console.log(`  Reply shape vs schema: ${out.schemaIssues.length ? `${out.schemaIssues.length} issue(s) — ${out.schemaIssues.slice(0, 5).join("; ")}` : "matches"}`);
    console.log(`  Automatic checks failing: ${flags.join(", ") || "none"}`);
    const cost = (out.inputTokens * PRICE.input + out.outputTokens * PRICE.output) / 1e6;
    console.log(`  Tokens: ${out.inputTokens} in / ${out.outputTokens} out ≈ $${cost.toFixed(3)}\n`);
  }

  if (runs > 1) {
    const avg = (f: (r: (typeof results)[number]) => number) => results.reduce((a, r) => a + f(r), 0) / results.length;
    console.log(`Average over ${runs} runs: ${Math.round(avg((r) => (r.report.score.all.ok / r.report.score.all.total) * 100))}% · ${(avg((r) => r.ms) / 1000).toFixed(1)}s`);
  }

  mkdirSync("eval-results", { recursive: true });
  const file = path.join("eval-results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ photo: photoPath, effort: effort ?? process.env.ANTHROPIC_EFFORT ?? "medium", results }, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
