# Thai Receipt Ledger — notes for Claude Code

Photo of a Thai tax invoice / receipt → AI reading → the same layout in Thai / English / Japanese → automatic
checks → company ledger. Used by one company's staff (admin + staff). **Full handoff (Korean):
[`docs/HANDOFF.md`](docs/HANDOFF.md)** — read sections 1, 7 and 7-1…7-5 before changing anything.

## Working with the owner
- Reply in **Korean**, plainly (not a developer). Explain what changed and what they need to do, step by step.
- Ask when a product decision is theirs ("모르는건 나한테 물어봐"). Commit **only when asked**; end commit
  messages with the `Co-Authored-By` line.
- **Never ask for keys in chat.** Keys live in `.env.local` (local dev) and `.env.deploy` (deploy: Supabase
  cloud + Vercel + Gmail app password), both git-ignored. Open the file for them (Notepad) and validate
  without printing values.
- Taste: clean, modern Apple / Apple-Intelligence look; no heavy gradients (they asked to remove them).

## Commands (run in this folder)
| What | Command |
|---|---|
| Local DB (Docker) | `npm run db:start` · reset `npx supabase db reset` then `npm run db:bootstrap -- suhojayu4@gmail.com "pppyu" --sample` |
| Dev server | `npx next dev --turbopack -p 3130` → http://localhost:3130/ja · login mail at http://127.0.0.1:54324 |
| Checks | `npx tsc --noEmit` · `npx eslint .` · `npx vitest run` (132) · `npm run db:test` (pgTAP 35) |
| Build (must pass before deploy) | `npx next build` (stop the dev server first, it shares `.next`) |
| Deploy app | `npx vercel deploy --prod` (this PC is logged in to Vercel) |
| Deploy DB changes | `npx supabase db push` (linked to the cloud project) then `npx supabase test db --linked` |
| Email templates / SMTP | `npx tsx scripts/setup-email.ts` |

## Production
- https://thai-receipt-ledger.vercel.app — Vercel team `tladndus123-webs-projects`, project `thai-receipt-ledger`,
  region sin1. Env vars live in Vercel (9). Daily cron 02:00 UTC → `/api/cron/due-reminders`.
- Supabase project **INC** (Singapore). Sign-up disabled (invite only), Gmail SMTP, 4-language auth emails.
- LINE bot **TDB** (`@136udmem`), webhook `/api/line/webhook`. Replies in Thai + Japanese.
- Admin: suhojayu4@gmail.com (pppyu).
- UI defaults (owner's choice, 2026-09-26): Japanese first (ja · th · en · ko), light theme; sign-in lasts 12 h per
  device, then a security message and a new sign-in. Sign-in links work in any browser (implicit flow).
  Pending: code in the sign-in email — see HANDOFF §7-6 (`CODE_IN_EMAIL`).

## Rules that protect the books (see HANDOFF §7)
- Money in satang integers; don't change `lib/` results without updating tests first.
- Documents are never hard-deleted (soft delete, reason required, admins only). Drafts never count in totals.
- Every new UI string goes into all four `messages/{ko,th,en,ja}.json`.
- Database rules live in `supabase/migrations` + `supabase/tests/rls.test.sql`; add a test with every rule.
- New migration → apply locally (`npx supabase migration up`), `npm run db:test`, then push to cloud.
