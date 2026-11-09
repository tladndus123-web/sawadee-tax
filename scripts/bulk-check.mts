// LOCAL ONLY check (2026-11-09, "1000장 넘어도"): with more than 1000 rows, do the server readers get them all?
// Run: npx.cmd tsx --env-file=.env.local --conditions=react-server scripts/bulk-check.mts
import { costInputs } from "../lib/month-end-server";
import { ledger, salesOf } from "../lib/line-ask-server";
import { supabaseAdmin } from "../lib/supabase/admin";

if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("local only");
const admin = supabaseAdmin();
const plain = await admin.from("documents").select("id").is("deleted_at", null);
const count = (await admin.from("documents").select("id", { count: "exact", head: true }).is("deleted_at", null)).count;
console.log(`documents in the database: ${count}; one plain request returns: ${plain.data?.length}`);
const books = await ledger(admin);
console.log(`ledger() (LINE answers, reports, AI, Grok Bot): ${books.saved.length + books.drafts.length} documents`);
const sales = await salesOf(admin, "2025-01-01", "2026-12-31");
const salesCount = (await admin.from("sales").select("id", { count: "exact", head: true }).gte("sale_date", "2025-01-01").lte("sale_date", "2026-12-31")).count;
console.log(`salesOf(): ${sales.length} of ${salesCount} sales rows`);
const ci = await costInputs(admin);
console.log(`costInputs() sales (P&L, month-end report): ${ci.sales.length} of ${(await admin.from("sales").select("id", { count: "exact", head: true })).count}`);
