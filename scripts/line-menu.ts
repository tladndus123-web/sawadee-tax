// Makes (or remakes) the admins' LINE menus — one per language from docs/line-menu/{ko,ja,th,en}.png — and gives
// every linked admin the one in their phone's LINE language.
//
//   npx.cmd tsx scripts/line-menu.ts
//
// Pictures: 2500 × 1686 PNG or JPEG under 1 MB, cards where lib/line-menu.ts expects them (the owner's design).
// Reads LINE_CHANNEL_ACCESS_TOKEN from .env.local and the admins from the database in .env.deploy (production).
// Prints no keys. Safe to run again: old menus are deleted after the new ones are live.

import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const deploy = config({ path: ".env.deploy", quiet: true, processEnv: {} }).parsed ?? {};

async function main() {
  const sharp = (await import("sharp")).default;
  const { MENU_LANGS, MENU_SIZE, menuAlias, menuDefinition, profileLang } = await import("../lib/line-menu");
  const { lineBlobClient, lineClient } = await import("../lib/line");
  const client = lineClient();

  // Check all four pictures before changing anything
  const pictures = new Map<string, { data: Buffer; type: string }>();
  for (const lang of MENU_LANGS) {
    const data = readFileSync(`docs/line-menu/${lang}.png`);
    const meta = await sharp(data).metadata();
    if (meta.width !== MENU_SIZE.width || meta.height !== MENU_SIZE.height) throw new Error(`${lang}.png is ${meta.width} × ${meta.height}, not 2500 × 1686`);
    if (data.length > 1024 * 1024) throw new Error(`${lang}.png is over 1 MB`);
    pictures.set(lang, { data, type: meta.format === "png" ? "image/png" : "image/jpeg" });
  }

  const before = (await client.getRichMenuList()).richmenus.map((m) => m.richMenuId);
  const made = new Map<string, string>();
  for (const lang of MENU_LANGS) {
    const { richMenuId } = await client.createRichMenu(menuDefinition(lang));
    const p = pictures.get(lang)!;
    await lineBlobClient().setRichMenuImage(richMenuId, new Blob([new Uint8Array(p.data)], { type: p.type }));
    const alias = menuAlias(lang);
    const had = await client.getRichMenuAlias(alias).catch(() => null);
    if (had) await client.updateRichMenuAlias(alias, { richMenuId });
    else await client.createRichMenuAlias({ richMenuAliasId: alias, richMenuId });
    made.set(lang, richMenuId);
    console.log(`Menu ${lang} ready`);
  }

  // Every linked, active admin of the live site, in their LINE language
  if (!deploy.SUPABASE_PROJECT_REF || !deploy.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".env.deploy is missing the Supabase settings");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(`https://${deploy.SUPABASE_PROJECT_REF.trim()}.supabase.co`, deploy.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false } });
  const { data: admins, error } = await db.from("members").select("line_user_id").eq("role", "admin").is("disabled_at", null).not("line_user_id", "is", null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const a of admins ?? []) {
    const lang = await profileLang(a.line_user_id as string);
    await client.linkRichMenuIdToUser(a.line_user_id as string, made.get(lang)!);
    counts[lang] = (counts[lang] ?? 0) + 1;
  }
  console.log(`Given to ${admins?.length ?? 0} admin(s): ${JSON.stringify(counts)}`);

  for (const id of before) await client.deleteRichMenu(id).catch(() => undefined);
  if (before.length) console.log(`${before.length} old menu(s) deleted`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
