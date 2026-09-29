// Backup of the live ledger to this computer: every table as JSON (one folder per run) and every photo
// (one shared folder, only new files are downloaded). Read-only on the cloud side.
//   npx.cmd tsx scripts/backup.ts                 → Documents\SawadeeTAX-backup
//   npx.cmd tsx scripts/backup.ts D:\somewhere     → that folder instead
// Reads .env.deploy (SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY). Prints no secrets. Safe to run again.
// Keep the backup folder private: it holds the company's books.
// - The tables are found in supabase/migrations ("create table public.…"), so a new table is backed up without
//   touching this file (lib/backup-tables.ts, tested).
// - One table failing does not stop the others; the run still ends with an error so the log shows it.
// - The newest 12 runs are kept; older run folders are removed (photos are never removed).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { runsToRemove, tablesOf } from "../lib/backup-tables";

config({ path: ".env.deploy", quiet: true });
const clean = (v?: string) => (v ?? "").replace(/\s+/g, "");
const ref = clean(process.env.SUPABASE_PROJECT_REF);
const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!ref || !key) throw new Error("SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY are needed in .env.deploy");

const root = process.argv[2] || join(homedir(), "Documents", "SawadeeTAX-backup");
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const runDir = join(root, stamp);
const photoDir = join(root, "photos");
mkdirSync(runDir, { recursive: true });
mkdirSync(photoDir, { recursive: true });

const db = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false } });

const MIGRATIONS = "supabase/migrations";
const TABLES = tablesOf(
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8")),
);
const KEEP_RUNS = 12;

async function all(table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function listPhotos(prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from("documents").list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`photos: ${error.message}`);
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back without an id
      if (item.id) out.push(path);
      else out.push(...(await listPhotos(path)));
    }
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  const counts: Record<string, number> = {};
  const failed: string[] = [];
  for (const t of TABLES) {
    try {
      const rows = await all(t);
      counts[t] = rows.length;
      writeFileSync(join(runDir, `${t}.json`), JSON.stringify(rows, null, 1));
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }

  const photos = await listPhotos();
  let fresh = 0;
  for (const p of photos) {
    const file = join(photoDir, ...p.split("/"));
    if (existsSync(file)) continue;
    const { data, error } = await db.storage.from("documents").download(p);
    if (error || !data) throw new Error(`photo ${p}: ${error?.message ?? "empty"}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    fresh += 1;
  }

  writeFileSync(
    join(runDir, "README.txt"),
    [
      `Sawadee TAX backup · ${new Date().toISOString()}`,
      "",
      "Each .json file is one database table (rows as exported). Photos are in ../photos, by their storage path",
      "(documents.photo_path). Keep this folder private: it holds the company's books.",
      "",
      ...Object.entries(counts).map(([t, n]) => `${t}: ${n}`),
      `photos: ${photos.length} (${fresh} new this time)`,
      ...(failed.length ? ["", "NOT BACKED UP:", ...failed] : []),
    ].join("\n"),
  );
  console.log(`Backup saved to ${runDir}`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
  console.log(`  photos: ${photos.length} (${fresh} new) in ${photoDir}`);

  // Keep the newest runs (photos stay)
  const runs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const old of runsToRemove(runs, KEEP_RUNS)) {
    rmSync(join(root, old), { recursive: true, force: true });
    console.log(`  removed old run ${old}`);
  }
  if (failed.length) throw new Error(`not backed up: ${failed.join("; ")}`);
}

main().catch((e) => {
  console.error("Backup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
