// Cloud email setup: Supabase Auth sends through Gmail SMTP (app password) with the 4-language templates.
//   npx tsx scripts/setup-email.ts          (reads .env.deploy: SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, GMAIL_APP_PASSWORD)
// Safe to run again. Prints no secrets.

import { config } from "dotenv";
import { invite, magicLink } from "./email-templates";

config({ path: ".env.deploy", quiet: true });
const clean = (v?: string) => (v ?? "").replace(/\s+/g, "");
const ref = clean(process.env.SUPABASE_PROJECT_REF);
const token = clean(process.env.SUPABASE_ACCESS_TOKEN);
const pass = clean(process.env.GMAIL_APP_PASSWORD);
const sender = process.env.GMAIL_ADDRESS || "suhojayu4@gmail.com";

async function main() {
  if (!ref || !token || !pass) throw new Error("SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN and GMAIL_APP_PASSWORD are needed in .env.deploy");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      smtp_host: "smtp.gmail.com",
      smtp_port: "465",
      smtp_user: sender,
      smtp_pass: pass,
      smtp_admin_email: sender,
      smtp_sender_name: "Sawadee TAX",
      // Gmail allows ~500 a day; this is plenty for a small team and still stops abuse
      rate_limit_email_sent: 60,
      // The sign-in email carries a one-time code as well as the link (see email-templates.ts)
      mailer_otp_length: 6,
      mailer_subjects_magic_link: magicLink.subject,
      mailer_templates_magic_link_content: magicLink.content,
      mailer_subjects_invite: invite.subject,
      mailer_templates_invite_content: invite.content,
    }),
  });
  if (!res.ok) throw new Error(`Supabase: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const c = (await res.json()) as Record<string, unknown>;
  console.log(`SMTP ${c.smtp_host}:${c.smtp_port} as ${c.smtp_admin_email} · emails/hour ${c.rate_limit_email_sent} · code length ${c.mailer_otp_length} · templates set`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
