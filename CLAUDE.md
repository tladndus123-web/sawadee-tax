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
| Checks | `npx tsc --noEmit` · `npx eslint .` · `npx vitest run` (625) · `npm run db:test` (423 in 9 files) · LINE claims without LINE: `npx.cmd tsx scripts/line-expense-check.mts` (local only) |
| Build (must pass before deploy) | `npx next build` (stop the dev server first, it shares `.next`) |
| Deploy (app + DB) | **Push to `main` and let GitHub Actions deploy** (`.github/workflows/deploy.yml`: checks → migrations → pgTAP on the cloud DB → Vercel → live check). Cursor pushes to `main` too, so never deploy from this PC (`vercel deploy`) — a local build can put an older tree live over theirs (happened twice 2026-11-05). Check the run with the GitHub API (token from `git credential fill` for github.com, never printed): `GET https://api.github.com/repos/tladndus123-web/sawadee-tax/actions/runs?per_page=3`. Only if Actions is down: `npx vercel deploy --prod` from an up-to-date `main` |
| If a deploy is broken | `npx vercel rollback <previous url>`; after a rollback new deploys are not live until `npx vercel promote <url>`. A failed Actions run leaves the site as it was |
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
- **LINE links open outside LINE** (2026-10-27): every app link in a bot message gets `openExternalBrowser=1`
  (`lib/line-links.ts`, applied in `lineClient()` = `AppLinksClient` for push / reply / multicast), so it opens in
  Safari / Chrome where the sign-in stays and Face ID works (LINE's own browser keeps no sign-in). `appUrl()` lives in
  `lib/app-url.ts` (re-exported by line-bot).
- **Ledger → expense claim** (2026-10-27): admins, on a saved document, "경비 청구로 넘기기" picks who paid →
  an approved claim with `document_id` = the document (`claimFromDocument`, `moveToClaim`, `components/expenses/ToExpenseCard.tsx`);
  the document stays (cost counted once); paying back marks it paid (`payClaims` → `setPaidMany`). One claim per
  document: unique index `…002700_claim_from_document.sql`.
- **Customising** (2026-10-27, owner's picks): supplier **payment terms** (`vendors.pay_terms`, `lib/pay-terms.ts`;
  `applyTerms` inside `applyRule` → due date when the paper prints none, "now" = paid on its date; selector in
  `VendorRule`); **dashboard cards** order / hide per person (`lib/dash-layout.ts`, `DashEditor`; wide cards on top, the
  rest in balanced columns; cards: profit, tiles, to-do, coming up (`UpcomingCard`, 2 weeks of the calendar without
  bills / VAT), last 7 days, cost, expense claims (`ClaimsCard`); the staff card left 2026-10-27); **saved ledger views** + this / last month filter (`lib/ledger-views.ts`, `SavedViews`,
  `ArchiveFilter.period`); per-person prefs live in auth `user_metadata` (`lib/user-prefs.ts` `usePref`); the
  **accountant's Excel layout** (`company_settings.excel_format`, `lib/excel-format.ts`, `ExcelFormatCard` in settings;
  app Excel, LINE Excel and the accountant link follow it); **files in the AI panel** (drop / clip / paste → ledger queue
  or calendar dates via `/api/calendar/read`, each date saved with a tap). `lib/messages.test.ts`: same keys in 4
  languages, no apostrophe before `{placeholder}` (ICU escapes it).
- **Speed** (2026-10-27): lists read `DOC_LIST_COLUMNS` (lib/db-map: every column but `ai_raw` and `field_boxes`; the
  document screen fetches its boxes with `fieldBoxesOf` and waits for them, so a save never drops them). The ledger is
  kept on the device (`lib/idb-cache.ts`, IndexedDB `sawadee-cache`, key `ledger:v1:<user>`; bump the version when the
  columns change): shown at once, then only `id, updated_at` of every document is asked and only new / changed rows are
  downloaded (`documents_stamp` sets updated_at on every change); gone ones drop out; cleared on sign-out. Sign-in
  checks in the browser use `getSession()` (no server trip; the database checks the token).
- **Phones** (2026-10-27): tab bar = dashboard · ledger · [+ upload, raised blue circle `.tab-plus`] · sales · more
  (`.tab-more` opens a sheet with the rest of the menu; app-header.tsx). The AI button on phones is the mark only (44 px).
  Every screen's outer grid is `grid-cols-[minmax(0,1fr)]` so a long number can never push a page wider than the phone.
  "얼굴 인증" is now **간편 로그인** (かんたんログイン / เข้าสู่ระบบด่วน / Quick sign-in) with `public/quick-signin.svg`
  (blue tile, white key) and the KeyRound icon.
- **PC layout** (2026-10-27): every screen is `max-w-6xl` (one left edge on every page, payroll no longer changes
  width per tab); the quick sign-in offer shows on the dashboard only. Sales on PC: result on top, cost (left) and the
  input calendar + weekdays (right), the days as one table (cards stay on phones). Amounts: `baht()` is now "฿64,200.00"
  / "−฿5.00" (no space, like `bahtWhole`); big summary figures use whole baht.
- **Branch passwords in staff management** (2026-11-04): 직원 관리 has "지점 비밀번호" (`BranchPins` from BranchCard —
  the same PINs as branch settings; admins type them too when choosing a branch). **Keeping one staff member out of a
  branch** (owner: "누르면 비밀번호 창이 뜨지만 그냥 보여 주기"): 직원 관리 → ⋯ → 지점 막기 (`BlockDialog`, table
  `member_branch_blocks`, admins only, …003000). For that person the branch is listed by `branches_with_pin()` (looks
  locked even without a PIN), `unlock_branch()` always answers wrong (counted as a try), `can_see_branch()` /
  `member_branches()` leave it out (app, LINE, STOCK). Tests `supabase/tests/branch_blocks.test.sql`.
- **Quick sign-in opens a branch** (2026-11-04): on a device with a registered passkey the branch PIN box shows
  "간편 로그인으로 열기" first (PIN below). `unlockWithPasskey` signs in again with the passkey, then
  `unlock_branch_passkey()` / `passkey_fresh()` (…003100) accept a non-email `amr` sign-in from the last 3 minutes
  (the app signs in only by email or passkey; the local auth server has no passkeys, so this is checked in pgTAP).
  A kept-out member fails here too.
- **Owners above admins** (2026-11-04, …003200_owners.sql): `members.owner` (admins with owner = true: w.yoshiko88,
  suhojayu4, kiichino1, suzun024k). Owners see every branch; only owners keep anyone (admins too) out of branches,
  set an admin's screens (`members.admin_screens`, null = all; lib/screens, ScreenGuard + menu — UI only), and
  make/change/remove admins and owners (trigger `members_owner_guard`, API invite check). Every admin policy on a
  branch table now uses `admin_for(branch_id)` / `admin_for_employee()`. Service-role reads for one admin (LINE
  answers, AI assistant, claim notices) go through `lib/branch-scope-server` (`scopedAdmin`, `hiddenBranches`).
  Company-wide reminders (VAT/payroll deadline totals) are not split by branch.
- **No branch PINs any more** (2026-11-04, …003300): per-person branch access replaced them; all PINs were removed,
  the screens to set them are gone (only the "all branches" PIN stays, in branch settings). `set_branch_pin` is
  owners-only with no screen. **Staff management is owners only** (settings fold, /api/members, policy
  "owners manage members"; everyone still edits their own name/LINE link).
- **Limits applied everywhere** (2026-11-05, after a 3-role walkthrough): kept-out branches leave every list and total
  (`branch-store` splits `branches` / `kept` via `my_blocked_branches()`; only the branch picker shows them, locked);
  `members.all_branches` (…003400, owners set it in 지점 막기) removes "all branches" for an admin; dashboard cards of
  screens an admin may not open are hidden (`CARD_SCREEN`); the AI assistant, LINE number answers and the cron
  reminders/reports go only to `fullAdmin`s (owners, or admins with no screen list and no blocked branch —
  lib/full-admin-server); claim notices skip admins without the expenses screen; the menu waits for the member to
  load; "more" hides when empty.
- **Several closing reports a day** (2026-11-05, YUNA feedback: breakfast · lunch · dinner; …003500): `sales.part`
  (1, 2 …; unique branch+date+channel+part; part 0 on insert = next, trigger `sales_part`). Each report is a line, the
  day is their sum. `lib/sales-slips` decides add / same (read twice: same receipt range, or same figures with none)
  / replace (a typed or imported day total). `saveSale` without id inserts a new slip. POS file imports (app + LINE)
  call `sales_clear_extra_slips` then upsert part 1. The sales list groups a day ("3장") and opens into its slips.
- **Expenses + calendar upgrade** (2026-11-06, …003600): expenses — month overview (total vs last month, category
  bar, who claimed most), receipt thumbnails, steps (sent → approved → paid), quick review (one card at a time, swipe /
  arrow keys), AI month report + one line per claim (`/api/expenses/insights`). Calendar — next deadline card (late
  ones first, VAT estimate, documents checked), AI week briefing (`/api/calendar/brief`), a sentence → a date
  (`/api/calendar/parse`, confirmed in the form), money going out by kind/week with a short-cash warning, busy weeks
  tinted, missed days red, phone calendar (iCal `/api/calendar/feed?t=…`, secret in `calendar_feed`,
  `calendar_feed_token()`). AI answers are kept in `ai_notes` (stamp = what they were made from + prompt version
  `PROMPTS` in lib/insights-server) and only full admins get them.
- **Staff schedule feed + company details** (2026-11-06, …003700): 급여 → 근태 → "캘린더로 공유" (`StaffCalendarShare`:
  team link + one per person, LINE / QR / share / copy, renew). `/api/calendar/feed?who=staff&t=…[&emp=id]` →
  `staffFeedIcs` (attendance today−14…+120, sick shown as leave, absences left out, Thai holidays); its own secret
  (`calendar_feed` id 2, `calendar_feed_token(p_new, p_which)`). The company name/address fields in settings were
  taken out again the same day (owner); the column `company_settings.address` stays, unused.
- **Sales AI + reading model by count** (2026-11-06): sales screen "AI 매출 분석" (`SalesInsight` →
  `/api/sales/insights` → `salesReport`, facts from pure `lib/sales-insight.ts`; full admins; kept in `ai_notes`).
  Reading: Sonnet 5.5 by default, Opus 5.5 (`bulkSetup`) when 3+ are read together — app uploads picked/taken at once
  (`addPhotos` sets `together`), pieces of one photo, sales closing reports (`batch` to `/api/extract-sales`), LINE
  image sets (`imageSet.total`).
- **Schedule from a photo** (2026-11-06): 급여 → 근태 → "사진으로 근무표" (`ScheduleFromPhoto`) → `/api/payroll/schedule-read`
  (admins; staff list read with the caller's session) → `readSchedule` (day codes W / W+n / O / A / S / X per person,
  `readingFor(batch)`) → `cleanSheet` / `mergeSheets` / `cellsToSave` (pure, tested) → checked, tap a day to fix,
  then `saveAttendanceMany` (replaces those days).
- **Ledger tidy-up + payroll steps** (2026-11-06): ledger status chips (needs a look / unpaid / possible duplicate =
  open warning "dup"), one toolbar (filter and saved views in popovers, this month's export, bulk menu, ⋯ = cash box,
  assets), rows in date groups inside each month (`lib/ledger-days` `groupByDays`). Payroll: `PayrollSteps` above the
  tabs — attendance / pay lines / office checks counted per shown employee; payslips sent = `calendar_done`
  `slips:YYYY-MM` (set by /api/payroll/slips or ticked), filing = `monthly:YYYY-MM` (same tick as the tax calendar).
- **Tidy-up of three screens** (2026-11-06, owner's picks): attendance = 2 buttons (fill from photo, share menu) +
  a sticky totals column per person; expenses = the three tiles folded into `ExpenseOverview` (`status` prop, chips
  that open the tab); dashboard = `BalancedColumns` (measured heights, the split that balances best, last card
  stretches) instead of CSS columns, and the passkey / install banners as one-line strips.
- **Expenses paid back with the pay** (2026-11-06, owner's pick; …003800): paying a claim "급여와 함께" asks whose pay
  (`expense_claims.employee_id`, guessed by name `guessEmployee`; claimers are members, employees are not). The pay run
  shows "경비 +n" per person, adds it to the month-end payment button and the totals (`payrollRefunds`, month of
  `paid_on`); it is **not pay** — no tax, no social security, not labour cost, not in `payroll_lines`. The printed
  payslip and the LINE payslip (`refund` in `payslipText`) show it after the net with the total to receive.
- **Full check fixes** (2026-11-06): a member now sees the receipt photo of their own waiting claim (…003900 — the
  "photos read" claim clause compared with the claim's own `name` column); the AI limit (`adminCaller`) counts only new
  AI work — the three report routes pass `later: true` and `spend` into `kept()`, which shows the kept answer (even an
  old one) when over the limit and throws `AiBusy` → 429 only when there is nothing to show.
- **Security check fixes** (2026-11-07): Next 15.5.29 / Zod 4.6.7 (npm audit: 0 in production deps); the sign-in
  landing only follows a same-site path (`lib/auth/safe-next`, "/\x" was let through); `/api/expenses/notify` sends the
  same claim at most once a minute and 10 notices a minute per person.
- **Tax return numbers** (2026-11-08, owner: "신고서 숫자 도우미"): `/ledger/filing/[month]` (`FilingHelper`, admins who may
  open sales) — total due, the ภ.พ.30 boxes 1–12 in the form's numbering with a copy button each (plain "6300.00"; box 10
  carried forward is typed, 11/12 follow), ภ.ง.ด.53 / ภ.ง.ด.3 tabs (`buildWhtFiling`: bad tax IDs, unpaid withholdings),
  checks, and "filed" ticks = the tax calendar's `vat:YYYY-MM` / `monthly:YYYY-MM`. Pure `lib/filing.ts` (purchases by
  claim month like the input tax report, sales by day, withholding by month paid). Opened from a blue button on every
  ledger month row (next to export, owner's pick), the dashboard VAT card and the export menu. Follows the branch being worked in.
  Box 10 fills itself from last month's box 12 (`carriedIn`, month by month; typed over when a refund was asked). The
  ภ.ง.ด.53 / 3 tabs download the attachment list for the Revenue Department's RD Prep (`lib/wht-file.ts`: the RD's
  FORMAT กลาง rules — UTF-8, "|", CR/LF, Buddhist dd/mm/yyyy, no * + / \ ! $ % # & @ , ' "; column names on line 1;
  name `PND53_<taxid>_<branch6>_<BE year>_<mm>_00_00.txt`) → RD Prep โอนย้ายข้อมูล → .rdx → e-Filing upload.
- **Grok Bot connection** (2026-11-08, owner: "설정에서 GROK BOT 연결 … 하루하루 총합 … 예약도"; Grok Bot = the owner's xAI desktop
  agent app, Cursor-based, with connectors + routines): settings → 알림 → Grok Bot 연결 (`BotCard`, owners) makes a key
  (`sk_sawa_…`, only its SHA-256 in `bot_keys`, …004000, server only; `/api/bot-keys` GET/POST/DELETE owners) and shows the
  connector to add in Grok Bot ("Add a custom connector": Server URL `<site>/api/mcp` + HTTP header `Authorization: Bearer <key>`,
  or its "MCP server JSON" = `{"sawadee-tax": {"type": "http", url, headers}}`; checked in Grok Bot 0.79.2 — its Bot runs on its
  own cloud computer, so a URL, not a local command) and a daily routine sentence to say to it.
  `/api/mcp` = MCP over HTTP (`lib/mcp.ts` JSON-RPC: initialize / tools/list / tools/call; 60 calls a minute per key);
  tools in `lib/bot-server.ts`: day_summary, books_overview, calendar, tax_return_numbers (read, whole company),
  add_calendar_date / remove_calendar_date (`calendar_events.source = 'bot'`; it removes only its own). It cannot change
  documents, pay or send. Numbers it reads go to xAI (said on the card).
  **Sign-in connection** (owner's pick, same day; the card's first way): Grok Bot gets only the server URL; the 401 of
  /api/mcp carries `WWW-Authenticate: Bearer resource_metadata=…` → `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-authorization-server` (catch-all, also the path form) → `/api/oauth/register` (public client, redirect
  https / loopback / app scheme only, `oauth_clients`) → `/api/oauth/authorize` (checks, then `/{locale}/connect` =
  `ConnectConsent`, owners tap 허용 / 거절 → `/api/oauth/approve`, one-time code 5 min in `oauth_codes`, …004100) →
  `/api/oauth/token` (PKCE S256, code once) → an ordinary `bot_keys` row with `client_id` (reconnecting replaces it).
  Pure rules `lib/oauth.ts`. Buttons on the card: `grokbot://app/v1/open` and `grokbot://app/v1/prompt?text=<routine>`
  (Grok Bot's own links, ≤ 1000 chars).
  **More work for the agent** (same day, owner: "일이나 보고 여러 일정을 줄이는"): tools find_documents, supplier_summary,
  send_line_to_owner (a noticeMessage card to the connecting owner's LINE only, 10 a day, `bot_line_sends`) and add_receipt
  (a picture as base64 → `lib/bot-docs-server` = the LINE photo path, 30 an hour per owner → saved as a **draft** by `bot_save_document`, owners,
  drafts only, …004200; PDFs: the agent sends each page as a picture). The card lists six ready routines (daily wrap-up to
  LINE, morning to-dos, gap watch, weekly, filing, emailed receipts) as `grokbot://app/v1/prompt` buttons. The site has
  `app/favicon.ico` + `public/icon-512.png` (Grok Bot showed a letter without them) and MCP serverInfo title + icons.
  **Using more of Grok Bot** (same day, owner: "최대한 활용"): (1) **events the moment they happen** — a Grok Bot routine
  started "when a webhook is triggered" has a URL + key; owners paste them in the card (`bot_webhooks`, …004300, https only,
  ≤ 3, `/api/bot-webhooks` GET/POST/PUT=test/DELETE). `lib/bot-events-server`: `claimEvent` (every new claim, from
  `notifyNewClaim`, app and LINE) and `documentEvent` (a saved receipt only when worth a look: anomalies dup/big/new,
  withholding, open check warnings) → `sendBotEvent` posts JSON {event, title, lines, text, open, data} with
  `Authorization: Bearer <key>`, 8 s, best effort. LINE saves call it in `saveReceipt`; app saves call `/api/bot-events`
  (session, 30/min) from `saveEntry`. (2) Tools **unusual_things**, **price_rises**, **sales_detail**,
  **add_document_note** (memo only, "Grok Bot: …", refused in a closed month) — 14 tools now. (3) A **SKILL.md**
  (`lib/bot-skill.ts`, English: which tool for what, the rules) downloaded from the card, and a memory sentence to tell
  Grok Bot once (`bot.skill.memory`, 4 languages). **Setup from the site** (owner: "웹사이트에서 모든 설정을 끝낼 수 있게"):
  the card's first section is 5 numbered buttons — ① `grokbot://app/v1/settings?id=integrations` + our URL on the clipboard
  (done = a live key exists), ② a prompt telling Grok Bot to fetch the public `/api/bot-skill` (SKILL.md, no secrets) and
  save it as a skill, ③ the memory prompt, ④ a prompt to create the webhook routine and then call the tool
  **set_event_webhook** (15 tools; https only, same URL replaces, ≤ 3, sends the test event; done = a hook exists),
  ⑤ the nightly routine prompt. Every prompt link stays under Grok Bot's 1000-character limit (checked in a test script).
  **Setup is now 2 steps** (owner: "인증이 너무 오래 걸리고 연결도 힘들다" — the OAuth sign-in never finished on the live
  site: 3 clients registered, no code issued): ① "연결 코드 만들고 복사" makes a key and copies the connector JSON
  `{"sawadee-tax": {"type":"http", url, headers: {Authorization: "Bearer <key>"}}}` → paste into Grok Bot's custom
  connector JSON; the card polls /api/bot-keys every 4 s and ticks itself on the key's first use (`last_used_at`).
  ② one sentence (`bot.setup.allInOne`, < 1000 chars) makes Grok Bot save the skill, the memory, the webhook routine
  (set_event_webhook) and the nightly routine; done when a hook exists or "했어요". The OAuth routes stay (advanced).
  Step ③ (added after Grok Bot reported it cannot see its own routine's webhook URL / key): the owner pastes them in the
  card ("저장하고 테스트" = POST /api/bot-webhooks then the test event); the all-in-one sentence no longer asks Grok Bot to
  call set_event_webhook. **Staff no longer read the member list** (…004400: "members read" = admins, or your own row while
  active; names for "who checked / deleted" come from `member_names()` — emails only for admins; ledger-store, activity,
  payroll-store use it; tests `supabase/tests/members_private.test.sql`). **Filing → close**: ticking "부가세 신고 완료" on
  the filing screen asks "장부도 마감할까요?" (admins; `closeMonth`).
  Live check 2026-11-08: the dup rule found 9 real duplicate pairs in October (same seller, doc no., date, amount; ≈ ฿10,804
  counted twice) — the owner removes them by hand: the duplicate banner on a saved document (`DocumentReview`, admins)
  now has **"중복으로 처리 (휴지통으로)"** (ask once more → `onDelete` with reason `dupBanner.reason` → trash, restorable;
  the earlier document stays). It shows only where the duplicate warning shows.
  **Bulk duplicate review** (owner: "중복 의심에서 … 여러 개 선택해서 삭제"): the ledger's "중복 의심" chip (admins) shows
  `DupReview` — groups of the same seller tax ID + doc no. (`lib/dup-groups`), oldest first with a "먼저 저장" badge; the later
  ones of a group whose date and amount match are pre-ticked (`likelyCopies`), differing groups are not; one sticky button →
  ask once → `softDeleteMany` (trash, reason `dupReview.reason`, restorable). When none are left the chip and the view go.
  **Duplicates before closing** (owner, same day): the close dialog (`MonthLockButton` `dups` / `onDups`) says "중복 의심 n쌍"
  with "먼저 중복 정리하기" (in the ledger it opens the review in place, elsewhere `/ledger?status=dup`); the dashboard's
  month-end checklist has a 4th line (`CloseTodo.dups` = `dupGroupsIn`, counted in `openCount`); the filing screen's
  "close the books too?" box shows it. Closing stays possible (warn only, like the other lines).
- **Price changes by supplier** (2026-11-08, owner: "같은 재료가 지난달보다 얼마나 올랐는지 한눈에"): `/vendors/prices[?month=]`
  (`components/vendors/PriceChanges.tsx`, vendors screen) from pure `priceBoard` in `lib/price-watch.ts`: each item bought in
  the month vs the last purchase before the month (same vendor tax ID + item name, unit unchanged), up / down / same (< 1 % or
  < ฿0.50), paid more = Σ (price − before) × qty; tiles, filter up / down / all, search, vendor cards, month arrows. Opened
  from a button on the vendors page and "가격 변화 전체 보기" under the cost card's rises. Automatic deletion of live data is
  off-limits for Claude (auto-mode classifier refused it 2026-11-08) — list the documents and let the owner decide.
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
