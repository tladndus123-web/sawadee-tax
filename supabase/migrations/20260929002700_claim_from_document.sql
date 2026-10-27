-- A ledger document moved to an expense claim (owner, 2026-10-27: "장부에서 경비로 넘기기"): at most one claim per
-- document, so the same receipt is never paid back twice. Adds an index only; nothing is changed or removed.
create unique index if not exists expense_claims_one_per_document on public.expense_claims (document_id) where document_id is not null;
