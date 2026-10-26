# Thai Receipt Ledger — notes for Claude Code

Shown to users as **Sawadee TAX** (renamed 2026-09-26; the repo / Vercel project keep the old name).

Photo of a Thai tax invoice / receipt → AI reading → the same layout in Thai / English / Japanese → automatic
checks → company ledger. Used by one company's staff (admin + staff). **Full handoff (Korean):
[`docs/HANDOFF.md`](docs/HANDOFF.md)** — read sections 1, 7 and 7-1…7-5 before changing anything.

## Working with the owner
- Reply in **Korean**, plainly (not a developer). Explain what changed and what they need to do, step by step.
- Ask when a product decision is theirs ("모르는건 나한테 물어봐"). When a change is done and checked, **commit, push and deploy
  right away** (owner's request, 2026-09-26; push to GitHub after every commit since 2026-09-27 so the collaborator
  has the latest code — `git pull --rebase` first); end commit messages with the `Co-Authored-By` line.
- Code: https://github.com/tladndus123-web/sawadee-tax (private, shared with a collaborator). **A push to `main` deploys
  to production** through GitHub Actions (`.github/workflows/deploy.yml`: checks → owner's Vercel CLI with the repo
  secret `VERCEL_TOKEN`; Hobby plan, so no Vercel seat for the collaborator). The workflow also applies new
  `supabase/migrations` to the cloud DB and runs the pgTAP tests there **before** the site deploys (secrets
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`), so a collaborator needs no Supabase access. `npx vercel deploy
  --prod` / `npx supabase db push` from this PC still work as a fallback. Keys never go into git.
- **Never ask for keys in chat.** Keys live in `.env.local` (local dev) and `.env.deploy` (deploy: Supabase
  cloud + Vercel + Gmail app password), both git-ignored. Open the file for them (Notepad) and validate
  without printing values.
- Taste: clean, modern Apple / Apple-Intelligence look; no heavy gradients (they asked to remove them).

## Commands (run in this folder)
| What | Command |
|---|---|
| Local DB (Docker) | `npm run db:start` · reset `npx supabase db reset` then `npm run db:bootstrap -- suhojayu4@gmail.com "pppyu" --sample` |
| Dev server | `npx next dev --turbopack -p 3130` → http://localhost:3130/ja · login mail at http://127.0.0.1:54324 |
| Checks | `npx tsc --noEmit` · `npx eslint .` · `npx vitest run` (504) · `npm run db:test` (328 in 3 files) · LINE claims without LINE: `npx.cmd tsx scripts/line-expense-check.mts` (local only) |
| Build (must pass before deploy) | `npx next build` (stop the dev server first, it shares `.next`) |
| Deploy app | `npx vercel deploy --prod` (this PC is logged in to Vercel). Then check `GET /api/extract` → `{"slipPieces":true}` and `POST` → 401. If broken: `npx vercel rollback <previous url>`; after a rollback new deploys are not live until `npx vercel promote <url>` |
| Deploy DB changes | `npx supabase db push` (linked to the cloud project) then `npx supabase test db --linked` |
| Email templates / SMTP | `npx tsx scripts/setup-email.ts` |

## Production
- https://thai-receipt-ledger.vercel.app — Vercel team `tladndus123-webs-projects`, project `thai-receipt-ledger`,
  region sin1. Env vars live in Vercel (12: + VAPID keys for phone notifications). Daily cron 02:00 UTC → `/api/cron/due-reminders`.
- Supabase project **INC** (Singapore). Sign-up disabled (invite only), Gmail SMTP, 4-language auth emails.
- LINE bot **TDB** (`@136udmem`), webhook `/api/line/webhook`. **Every message is in the reader's phone LINE language**
  (profile language → ko / ja / th / en, else English; `lib/line-lang.ts`; texts carry 4 parts th · ja · ko · en, the
  sender keeps one). Admins get a 6-button menu in that language (owner's pictures `docs/line-menu/{ko,ja,th,en}.png`,
  aliases `sawadee-admin-<lang>`, layout `lib/line-menu.ts`; remake: `npx.cmd tsx scripts/line-menu.ts`): month summary ·
  bills due in 7 days · VAT return / yesterday's sales · Excel (1-hour signed link, private bucket `line-exports`) ·
  upload (camera buttons). Answers are dashboard cards (`lib/line-dash.ts`, navy / blue / lime like the menu). Short words
  ("요약", "売上" …) work too (`lib/line-ask.ts`). On the 5th / 10th / 15th / 20th / 25th the daily cron also pushes the **5-day report** (`lib/report-server.ts`,
  four cards to swipe: last 5 days · month so far + forecast TIP · ✨ 3 Claude suggestions · 🔍 anything unusual from
  `lib/anomalies.ts` — receipt twice, ≥3× the usual of its category (≥ ฿5,000), new supplier + tax ID check).
  On the 1st the **month-end report** (`sendMonthEnd`, `lib/month-end-server.ts` — the P&L screen's numbers: what was
  left vs last month, target, costs, labour, VAT, withholding, social security; files card; margin TIP). Its buttons:
  `share=YYYY-MM` → **accountant link** `/{locale}/share/<token>` (no sign-in, that month only, 30 days; table
  `accountant_shares`, server only; Excel `/api/share/<token>/xlsx`, photos `/api/share/<token>/photo/<id>`; "share" is
  a public section in middleware), `goal=YYYY-MM` → target suggestion per branch (better of last month / 3-month avg,
  +5 %, rounded up to ฿10,000; `suggestGoals`), `goalset=…&p=0|5|10` → saves **that month only** in `branch_targets`
  (recomputed). Targets per month: `branch_targets` (branch, month) first, else `branches.sales_target` (standing) —
  `targetFor()` in lib/branches.ts (app) and `salesTarget(admin, month)` (server). Targets are **without VAT**: every
  progress bar / forecast compares the sales without VAT. The accountant page also offers all photos as one ZIP
  (`/api/share/<token>/photos`, built into `line-exports/share/<token>.zip`, 10-min signed link, names = Excel rows).
  **AI assistant** (2026-10-26): any other text from an active admin is answered from the books (`lib/assistant.ts`,
  `lib/assistant-server.ts` builds a compact text of the books): Haiku 5.5 answers, and hands over by itself to Sonnet 5.5
  for long analyses — no monthly limit since the owner lifted it 2026-10-26 (counted; cap 1000 against a runaway) (`assistant_claim()`, tables `assistant_turns` (last 24 h
  sent along, kept 30 days) / `assistant_usage`, server only, `…002100_assistant.sql`). Staff messages stay unanswered.
  Its answers are dashboard cards too: the model fills a small JSON card (`AiCard`, `parseCard` — app links only),
  `aiCard()` in `lib/line-dash.ts` draws it; plain text only if the model ever answers without one.
  **💡 TIP + question buttons on every card** (2026-10-26, `lib/line-tips.ts`): the menu cards' tips are worked out from
  the numbers (month-end forecast, cash vs bills, unclaimable VAT, weekday vs usual, Excel → accountant); the AI writes its
  own `tip` / `next`. Question buttons are LINE quick replies that send their words → the AI answers (labels ≤ 20 chars,
  tested). Morning reminders, the test button and the POS-file reply are cards too (`noticeMessage`: title / rows / list /
  link button, several = carousel); the receipt card moved to `line-dash.ts` in the same navy design.
- **Tax calendar + expense claims** (2026-10-27, ported from the for-sale version; HANDOFF "세무 달력 · 경비 청구"):
  `/calendar` admins only (Thai deadlines on working days, staff papers, bills due, company dates; `calendar_events`,
  `calendar_done`; morning LINE reminder adds only company dates + yearly filings, never the VAT / payroll / WHT / papers
  ones again). `/expenses` for members with an app account: claim → approve / reject → paid back = a paid ledger document
  with the claim's id (`expense_claims`, guard trigger, `autoUnder`). LINE: "경비" = 10-minute expense mode
  (`line_modes`), approve / reject card to every admin with LINE (`expense=approve&id=`), expense card in the month-end report.
- **AI assistant in the app** (2026-10-27, owner's mock-ups approved, logo "A" = `public/ai-mark.svg`): admins only;
  PC = top-bar button or Ctrl+K → panel docked right (page makes room, `html[data-ai-open]` in globals.css); phone =
  round button above the tab bar → sheet. `/api/assistant` → `answerInApp` (lib/assistant-server.ts): Sonnet 5.5
  (`APP_MODEL`, effort low), books (`booksContext` deep) + `calendarContext` (45 days, claims, drafts, days without
  sales); same `assistant_turns` history as LINE, counted in `assistant_usage`. Answers = the navy card
  (`components/assistant/AssistantPanel.tsx` CardView); "put X in the calendar" → `event` proposal (`parseEvent`),
  saved by the app only when Save is tapped (or changed in the calendar's `EventDialog`). Messages `aiPanel.*`.
- Admin: suhojayu4@gmail.com (pppyu).
- UI defaults (owner's choice, 2026-09-26): Japanese first (ja · th · en · ko), light theme; a sign-in stays until signing out
  (owner 2026-10-26 — the 12-hour limit is off; `NEXT_PUBLIC_SESSION_HOURS` would bring a limit back). Sign-in links work in any browser (implicit flow).
  The sign-in email carries a 6-digit code too (entered on the login page) — HANDOFF §7-6.
- On this PC PowerShell blocks `npx` (execution policy): use `npx.cmd …` instead; don't change the policy.
- After `npx supabase db reset` the local storage container may lose its unique index (uploads fail with 42P10): `docker exec supabase_db_thai-receipt-ledger psql -U supabase_admin -d postgres -c "create unique index if not exists bucketid_objname on storage.objects (bucket_id, name)"` then bootstrap again.

## Rules that protect the books (see HANDOFF §7)
- **Before adding a migration, `git pull` and take the next free number** in `supabase/migrations` (two sessions once both used `…000400`; the second was skipped by the database and the deploy stopped). A test now fails on duplicate numbers.
- Money in satang integers; don't change `lib/` results without updating tests first.
- Deleting is a soft delete (reason required, admins only). Delete for good only from the trash, admins only, never a saved
  document of a closed month, and a record stays (`purge_document`, owner's decision 2026-09-26). Drafts never count in totals.
- Every new UI string goes into all four `messages/{ko,th,en,ja}.json`.
- Database rules live in `supabase/migrations` + `supabase/tests/rls.test.sql`; add a test with every rule.
- **Sawadee STOCK** (separate app, `~/sawadee-stock`, same database, 2026-10-09): its tables are `stock_items`,
  `stock_recipes`, `stock_movements`, `stock_suppliers`, `stock_external_refs`, `stock_takes` (migrations `…001500_stock_app.sql`,
  `…001600_stock_take.sql`, `…001700_stock_import.sql`; tests `supabase/tests/stock.test.sql`). It reads TAX tables (branches, members, branch PINs via
  `can_see_branch()`) and writes one: `stock_counts` (month-end stock money), only from a confirmed stocktake
  (`stock_take()`, note "Sawadee STOCK"), never in a closed month.
- New migration → apply locally (`npx supabase migration up`), `npm run db:test`, then push to cloud.
