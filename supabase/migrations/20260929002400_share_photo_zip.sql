-- The accountant link's "all photos" download (owner, 2026-10-26): the server builds a ZIP of the month's photos in
-- the private line-exports bucket and hands out a short signed link. ZIPs are bigger than Excel files: up to 50 MB.
update storage.buckets
set allowed_mime_types = array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
    file_size_limit = 52428800
where id = 'line-exports';
