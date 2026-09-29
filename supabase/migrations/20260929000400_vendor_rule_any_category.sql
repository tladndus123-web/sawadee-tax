-- A vendor's automatic category may be any category that exists (the newer built-in ones — consumables, repairs,
-- fees, asset — and the company's own), not only the nine of the first version (found 2026-09-29: saving such a rule
-- was refused). The category table is the list now; a category a vendor rule uses cannot be deleted (categories_guard).
alter table public.vendors drop constraint if exists vendors_rule_category_check;
alter table public.vendors
  add constraint vendors_rule_category_fkey foreign key (rule_category) references public.categories (key) on update cascade on delete restrict;
