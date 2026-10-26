-- Excel files the LINE bot hands an admin as a one-hour download link (owner, 2026-10-26: "📎 엑셀 받기").
-- Its own private bucket: only Excel, no policies at all, so only the server (service role) reads or writes it;
-- the link is a signed URL. The bot deletes the earlier files each time.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('line-exports', 'line-exports', false, 10485760, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
