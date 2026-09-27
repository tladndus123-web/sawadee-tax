-- Keep the original PDF of documents uploaded as PDFs (e-Tax Invoices: the buyer must keep the electronic original,
-- not only a printout). Same 5 MB limit as photos.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'documents';
