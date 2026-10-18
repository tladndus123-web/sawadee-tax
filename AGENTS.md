# Sawadee TAX (thai-receipt-ledger) — notes for AI coding agents

Read this before changing anything. `CLAUDE.md` holds the same rules for Claude Code; the full handoff (Korean) is
[`docs/HANDOFF.md`](docs/HANDOFF.md) — read its sections 1, 7 and 7-1…7-5 first.

## What this is
A web app for one company's restaurants in Thailand (several branches). Photo of a Thai tax invoice / receipt → AI
reading (Claude, server side) → the same layout in Thai / English / Japanese → automatic checks → company ledger.
Also: sales (POS closing reports, delivery apps), cost control (food / labour / rent), payroll with Thai filings
(ภ.ง.ด.1, สปส.1-10, 50 ทวิ), withholding lists (ภ.ง.ด.53 / 3), cash box, vendor payment QR (PromptPay), LINE bot,
phone notifications. Users: admins and staff; screens in ja · th · en · ko (Japanese first).

Stack: Next.js 15 (App Router, `app/[locale]`), TypeScript, Tailwind 4 + shadcn/ui (Radix), next-intl, Supabase
(Postgres + RLS + storage + auth), Vercel (region sin1), `@anthropic-ai/sdk` for the AI reading (keep using it —
the prompts, caching and accuracy tests are built around Claude models).

## Working with the owner
- The owner is not a developer. Reply in **Korean**, plainly: what changed, and what they need to do, step by step.
- When a product decision is theirs, ask first ("모르는건 나한테 물어봐"). Offer short multiple-choice options.
- Taste: clean, modern Apple-like look; no heavy gradients.

## How changes go live (important)
- Code: GitHub `tladndus123-web/sawadee-tax` (private). **Every push to `main` deploys to production** through
  `.github/workflows/deploy.yml`: `npm ci` → `tsc` / `eslint` / `vitest` → new `supabase/migrations` applied to the
  cloud database → pgTAP rule tests on the cloud (rolled back) → Vercel deploy. Any failing step stops the deploy.
- Work on a branch and open a pull request; the owner merges it (merging = deploying). Do not push to `main` unless the
  owner asks for it.
- The repository secrets (`VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) are already set on GitHub.
  The app's own keys (Anthropic, LINE, Supabase service role, VAPID …) live in Vercel's environment settings.
- **Never ask for keys in chat and never put keys in git.** Local key files `.env.local` / `.env.deploy` are
  git-ignored and stay on the owner's PC.

## Checks (run before every pull request)
| What | Command |
|---|---|
| Install | `npm ci` |
| Types | `npx tsc --noEmit` |
| Lint | `npx eslint .` |
| Unit tests | `npx vitest run` (422 tests) |
| Build | `npx next build` |
| Database rules | `npm run db:test` (pgTAP 231 + STOCK 61) — needs Docker + `npx supabase start`; if Docker is not available, say so: the deploy workflow runs them on the cloud before going live |

## Rules that protect the books (see HANDOFF §7)
- **Migrations:** before adding one, pull and take the next free number in `supabase/migrations`
  (`20260929001900_…` is the latest at the time of writing; a test fails on duplicate numbers). Every new database rule
  gets a test in `supabase/tests/rls.test.sql` (bump `select plan(N)`). Tests write only to rows they create or to the
  year 2001, never to real months — the cloud database holds real data.
- Money is computed in satang integers (`lib/money.ts`). Don't change a `lib/` result without updating its test first;
  every `lib/` change comes with a test.
- Deleting is a soft delete (reason required, admins only). Delete for good only from the trash, admins only, never a
  saved document of a closed month, and a record stays (`purge_document`). Drafts never count in totals.
- A closed month (`month_locks`) cannot change: documents, sales, payroll, labour, fixed costs, cash box, stock.
- Branch privacy: staff see only branches they unlocked with the branch PIN (`can_see_branch()` in RLS).
- Every new UI string goes into all four `messages/{ko,th,en,ja}.json`.
- Security: CSP and other headers in `next.config.ts`; API routes check sign-in and role; owner-rights database
  functions are closed to signed-out visitors (`…001900_security_tighten.sql`).

## Map of the code
- `app/[locale]/(app)/…` pages · `app/api/…` server routes (AI reading `extract`, `extract-sales`, LINE webhook,
  daily cron `cron/due-reminders`, members, payslips).
- `components/…` by area (dashboard, ledger, sales, payroll, vendors, settings, upload, invoice, ui).
- `lib/…` the logic, each with a `*.test.ts`. AI reading: `lib/extract-server.ts` (prompt in
  `docs/reference/extract-prompt.txt`, cached; known sellers and our company as hints from
  `lib/reading-hints-server.ts`; buyer fixed by `lib/our-company.ts`; reply parsed by `lib/extract-schema.ts`).
- Accuracy on real documents: `npx tsx scripts/eval-real.ts` (paid API calls, read-only on production; needs the
  owner's local key files — ask the owner to run it).
- **Sawadee STOCK** is a separate app (`~/sawadee-stock`) on the same database: its tables are `stock_*`; it writes
  only `stock_counts`, through `stock_take()`. Don't change those tables without checking that app.

## Production facts
- Site https://thai-receipt-ledger.vercel.app · Supabase project INC (Singapore) · LINE bot `@136udmem`
  (replies in Thai + Japanese) · daily cron 02:00 UTC.
- Sign-up is closed (invite only); sign-in by email link or 6-digit code; a session lasts 12 h.
