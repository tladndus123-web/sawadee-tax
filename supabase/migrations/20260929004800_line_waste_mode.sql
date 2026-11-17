-- LINE waste mode (owner 2026-11-18, restaurant extra; lib/waste-line-server): "폐기" puts a member in waste mode; a photo
-- sent then waits in line_modes.photo_path for the next line, which becomes a waste record. Server only, as before.
-- Added only: the mode list keeps 'expense' and 'contract'.
alter table public.line_modes drop constraint if exists line_modes_mode_check;
alter table public.line_modes add constraint line_modes_mode_check check (mode in ('expense', 'contract', 'waste'));
alter table public.line_modes add column if not exists photo_path text check (photo_path is null or (photo_path like 'waste/%' and length(photo_path) <= 300));
