// Makes (or remakes) the admins' LINE menu from the owner's picture and gives it to every linked admin.
//
//   npx.cmd tsx scripts/line-menu.ts "C:\path\menu.png"
//
// The picture: 2500 × 1686 PNG or JPEG, under 1 MB, 6 buttons in a 3 × 2 grid in this order (lib/line-menu.ts):
//   📊 this month · 💸 to pay this week · 🧾 VAT return / 📈 yesterday's sales · 📎 Excel · 🌐 app
// Reads LINE_CHANNEL_ACCESS_TOKEN + NEXT_PUBLIC_APP_URL from .env.local and the admins from the database in
// .env.deploy (production). Prints no keys. Safe to run again: the old menu is deleted after the new one is live.

import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const deploy = config({ path: ".env.deploy", quiet: true, processEnv: {} }).parsed ?? {};

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npx.cmd tsx scripts/line-menu.ts "menu.png"');
  const picture = readFileSync(file);
  const type = picture[0] === 0x89 ? "image/png" : picture[0] === 0xff ? "image/jpeg" : null;
  if (!type) throw new Error("The picture must be PNG or JPEG");
  if (picture.length > 1024 * 1024) throw new Error(`The picture is ${(picture.length / 1024 / 1024).toFixed(1)} MB; LINE takes at most 1 MB`);
  const sharp = (await import("sharp")).default;
  const meta = await sharp(picture).metadata();
  const { MENU_ALIAS, MENU_SIZE, menuDefinition } = await import("../lib/line-menu");
  if (meta.width !== MENU_SIZE.width || meta.height !== MENU_SIZE.height)
    throw new Error(`The picture is ${meta.width} × ${meta.height}; it must be ${MENU_SIZE.width} × ${MENU_SIZE.height}`);

  const { lineBlobClient, lineClient } = await import("../lib/line");
  const app = (process.env.NEXT_PUBLIC_APP_URL || "https://thai-receipt-ledger.vercel.app").replace(/\/$/, "");
  const client = lineClient();

  const { richMenuId } = await client.createRichMenu(menuDefinition(app));
  await lineBlobClient().setRichMenuImage(richMenuId, new Blob([picture], { type }));
  console.log(`Menu made (${richMenuId})`);

  // Point the alias at the new menu (the bot finds it by name)
  const old = await client.getRichMenuAlias(MENU_ALIAS).catch(() => null);
  if (old) await client.updateRichMenuAlias(MENU_ALIAS, { richMenuId });
  else await client.createRichMenuAlias({ richMenuAliasId: MENU_ALIAS, richMenuId });

  // Every linked, active admin of the live site
  if (!deploy.SUPABASE_PROJECT_REF || !deploy.SUPABASE_SERVICE_ROLE_KEY) throw new Error(".env.deploy is missing the Supabase settings");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(`https://${deploy.SUPABASE_PROJECT_REF}.supabase.co`, deploy.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false } });
  const { data: admins, error } = await db.from("members").select("line_user_id").eq("role", "admin").is("disabled_at", null).not("line_user_id", "is", null);
  if (error) throw error;
  for (const a of admins ?? []) await client.linkRichMenuIdToUser(a.line_user_id as string, richMenuId);
  console.log(`Given to ${admins?.length ?? 0} admin(s)`);

  if (old && old.richMenuId !== richMenuId) {
    await client.deleteRichMenu(old.richMenuId).catch(() => undefined);
    console.log("Old menu deleted");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
