-- A member could not see the receipt photo of their own claim until it was paid back (found 2026-11-06 in the full
-- check): in "photos read" the claim clause compared the claim's id with split_part(name …), and inside that
-- subquery `name` is the claim's own column (who claimed), not the file's name. Same rule, with the file's name.
-- Changes this one policy only.

drop policy "photos read" on storage.objects;
create policy "photos read" on storage.objects for select using (
  bucket_id = 'documents' and public.is_member() and (
    public.is_admin()
    or exists (select 1 from public.documents d where d.id::text = split_part(objects.name, '/', 1))
    or exists (select 1 from public.sales s where s.photo_path = objects.name)
    or exists (select 1 from public.expense_claims e where e.id::text = split_part(objects.name, '/', 1))
    or objects.name like 'sample/%'
  )
);
