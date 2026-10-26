// LOCAL ONLY (ported 2026-10-27): the LINE pieces of expense claims and calendar reminders without a LINE channel —
// expense mode, a receipt photo becoming a claim (with a made-up reading), the same photo again, the approve button,
// the day's calendar reminder. Makes a made-up staff member and made-up LINE ids on the local database and removes
// them afterwards. Nothing is sent (the LINE key is dropped first).
// Run: npx.cmd tsx scripts/line-expense-check.mts
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";

if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("local only");
delete process.env.LINE_CHANNEL_ACCESS_TOKEN; // nothing is pushed
delete process.env.LINE_CHANNEL_SECRET;

const { supabaseAdmin } = await import("../lib/supabase/admin");
const { startExpenseMode, inExpenseMode, claimFromLine, expenseButton } = await import("../lib/expense-line-server");
const { reminderTexts } = await import("../lib/reminders-server");
const { inLang } = await import("../lib/line-lang");
const { photoHashServer } = await import("../lib/photo-hash-server");
const { normalize } = await import("../lib/normalize");
const { todayBangkok } = await import("../lib/thai-tax");

const admin = supabaseAdmin();
let fails = 0;
const check = (ok: boolean, what: string) => (console.log(`${ok ? "OK  " : "FAIL"} ${what}`), ok || fails++);
const said: string[] = [];
const send = async (m: { type: string; text?: string }[]) => void said.push(...m.map((x) => x.text ?? x.type));

const ADMIN_LINE = "Utest-admin-0001";
const STAFF_LINE = "Utest-staff-0001";
const { data: owner } = await admin.from("members").select("user_id, line_user_id").eq("role", "admin").is("disabled_at", null).limit(1).single();
const { data: made, error: madeErr } = await admin.auth.admin.createUser({ email: `line-check-${Date.now()}@example.test`, email_confirm: true });
if (madeErr) throw madeErr;
const staffId = made.user.id;
const { data: before } = await admin.from("company_settings").select("expenses").eq("id", 1).single();

try {
  await admin.from("members").upsert({ user_id: staffId, email: made.user.email!, name: "Somchai (test)", role: "staff" });
  await admin.from("members").update({ line_user_id: ADMIN_LINE }).eq("user_id", owner!.user_id);
  await admin.from("members").update({ line_user_id: STAFF_LINE }).eq("user_id", staffId);
  await admin.from("company_settings").update({ expenses: { autoUnder: 100 } }).eq("id", 1);

  await startExpenseMode(STAFF_LINE, send);
  check(/expense|경비|経費|เบิก/i.test(said.at(-1) ?? ""), `expense mode starts: ${said.at(-1)}`);
  check(await inExpenseMode(STAFF_LINE), "and stays on");
  said.length = 0;
  await startExpenseMode("Utest-nobody-0001", send);
  check(/app account|앱 계정|アカウント|บัญชี/.test(said[0] ?? ""), `someone without an app account is told so: ${said[0]}`);

  const photo = readFileSync("public/sample/panfood.jpg");
  const hash = await photoHashServer(photo);
  const read = async () => ({ ok: true as const, doc: normalize({ seller: { name: { en: "7-ELEVEN" } }, date: todayBangkok(), totals: { net: 89 }, category: "supplies" }) });
  const r1 = await claimFromLine(STAFF_LINE, photo, "image/jpeg", hash, null, read);
  check(r1.ok && !r1.pending && r1.text.includes("฿89"), `a ฿89 receipt becomes a claim, approved under ฿100: ${r1.text}`);
  const r2 = await claimFromLine(STAFF_LINE, photo, "image/jpeg", hash, null, read);
  check(!r2.ok, `the same photo again is refused: ${r2.text}`);

  // A bigger one waits; only an admin's button approves it
  const { data: c } = await admin.from("expense_claims").insert({ user_id: staffId, name: "Somchai (test)", day: todayBangkok(), amount: 90000, status: "pending" }).select("id").single();
  const statusOf = async () => (await admin.from("expense_claims").select("status").eq("id", c!.id).single()).data!.status;
  said.length = 0;
  await expenseButton(STAFF_LINE, `expense=approve&id=${c!.id}`, send);
  check(said.length === 1 && (await statusOf()) === "pending", `staff cannot approve: ${said[0]}`);
  said.length = 0;
  await expenseButton(ADMIN_LINE, `expense=approve&id=${c!.id}`, send);
  check((await statusOf()) === "approved", `the admin's button approves: ${said[0]}`);
  said.length = 0;
  await expenseButton(ADMIN_LINE, `expense=reject&id=${c!.id}`, send);
  check((await statusOf()) === "approved" && /already|処理済み|이미|ดำเนินการ/.test(said[0] ?? ""), `pressing again says it was handled: ${said[0]}`);

  // Calendar reminders: a company date 3 days ahead with a 3-day reminder, in the morning reminder texts
  const day = new Date(Date.parse(`${todayBangkok()}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const { data: ev } = await admin.from("calendar_events").insert({ title: "가게 임대료", date: day, repeat: "monthly", remind_days: 3, amount: 4500000 }).select("id").single();
  try {
    const texts = await reminderTexts(admin, todayBangkok());
    const cal = texts.find((t) => t.includes("가게 임대료"));
    check(!!cal && inLang(cal, "ko").includes("D-3") && inLang(cal, "ko").includes("฿45,000"), `the reminder is in the morning texts:\n${cal ? inLang(cal, "ko") : "(none)"}`);
  } finally {
    await admin.from("calendar_events").delete().eq("id", ev!.id);
  }
} finally {
  const { data: claims } = await admin.from("expense_claims").select("id, photo_path").eq("user_id", staffId);
  const paths = (claims ?? []).map((x) => x.photo_path as string | null).filter((x): x is string => !!x);
  if (paths.length) await admin.storage.from("documents").remove(paths);
  await admin.from("expense_claims").delete().eq("user_id", staffId);
  await admin.from("line_modes").delete().like("line_user_id", "Utest-%");
  await admin.from("members").update({ line_user_id: owner!.line_user_id ?? null }).eq("user_id", owner!.user_id);
  await admin.from("members").delete().eq("user_id", staffId);
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("company_settings").update({ expenses: before?.expenses ?? {} }).eq("id", 1);
}
console.log(fails ? `${fails} FAILED` : "ALL OK");
