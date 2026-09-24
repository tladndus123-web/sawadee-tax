// First-time setup (sign-up is off, so the first admin cannot invite themselves):
//
//   npm run db:bootstrap -- you@company.com "Your name"            # make this email an admin
//   npm run db:bootstrap -- you@company.com "Your name" --sample   # + the PANFOOD sample document and photo
//
// Then sign in at /ko/login with that email. Locally the magic link lands in Mailpit (http://127.0.0.1:54324).
// Uses SUPABASE_SERVICE_ROLE_KEY from .env.local. Safe to run again.

import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { docToRow } from "../lib/db-map";
import { normalize } from "../lib/normalize";
import { supabaseAdmin } from "../lib/supabase/admin";

config({ path: ".env.local", quiet: true });

async function main() {
  const [email, name = ""] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const withSample = process.argv.includes("--sample");
  if (!email || !/.+@.+\..+/.test(email)) {
    console.log('Usage: npm run db:bootstrap -- you@company.com "Your name" [--sample]');
    process.exitCode = 1;
    return;
  }
  const db = supabaseAdmin();

  // 1. The auth user (confirmed, no password: they sign in with a magic link)
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`Created user ${email}`);
  } else console.log(`User ${email} already exists`);

  // 2. Admin membership
  const { error: memberErr } = await db.from("members").upsert({ user_id: user.id, email, name, role: "admin" }, { onConflict: "user_id" });
  if (memberErr) throw memberErr;
  console.log(`${email} is an admin`);

  // 3. Optional sample document + photo (PROMPT §5 seed)
  if (withSample) {
    const photoPath = `sample/panfood-${Date.now()}.jpg`;
    const { error: upErr } = await db.storage
      .from("documents")
      .upload(photoPath, readFileSync("docs/reference/sample-panfood-invoice.jpg"), { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    const doc = normalize(JSON.parse(readFileSync("docs/reference/sample-document.json", "utf8")));
    const { row, items } = docToRow(doc, "reviewed");
    const { data: inserted, error: docErr } = await db
      .from("documents")
      .insert({ ...row, photo_path: photoPath, created_by: user.id, updated_by: user.id })
      .select("id")
      .single();
    if (docErr) throw docErr;
    const { error: itemErr } = await db.from("document_items").insert(items.map((i) => ({ ...i, document_id: inserted.id })));
    if (itemErr) throw itemErr;
    console.log(`Added the sample document (${doc.docNo})`);
  }
  console.log("Done. Sign in at http://localhost:3100/ko/login — local mail: http://127.0.0.1:54324");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
