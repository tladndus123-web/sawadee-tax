# Sawadee TAX (thai-receipt-ledger)

Bookkeeping for one company's restaurants in Thailand: a photo of a Thai tax invoice or receipt is read by AI, checked,
and kept in the company ledger — with sales, payroll, attendance, cash box, expense claims, the tax calendar and a LINE bot.
Screens in Japanese, Thai, English and Korean. Live at https://thai-receipt-ledger.vercel.app (invite only).

- **Start here:** [`CLAUDE.md`](CLAUDE.md) (how the project is run, commands, what was built and why) and
  [`AGENTS.md`](AGENTS.md) (the same rules for other coding agents). Full handoff in Korean: [`docs/HANDOFF.md`](docs/HANDOFF.md).
- **Stack:** Next.js 15 (App Router), TypeScript, Tailwind 4 + shadcn/ui, next-intl, Supabase (Postgres + RLS), Vercel.

## Run it locally

```bash
npm ci
npm run db:start                                   # local Supabase in Docker (API on 54321)
npm run db:bootstrap -- you@company.com "Name" --sample
npx next dev --turbopack -p 3130                   # http://localhost:3130/ja — sign-in mail at http://127.0.0.1:54324
```

Keys go into `.env.local` (see `.env.example`); they are never committed.

## Checks

```bash
npx tsc --noEmit && npx eslint . && npx vitest run && npm run db:test && npx next build
```

## Deploy

A push to `main` deploys through GitHub Actions (`.github/workflows/deploy.yml`: checks → database migrations →
database rule tests → Vercel). Do not deploy from a PC.
