-- History of one document (document page, newest first) and cleaning it up on delete-for-good: an index on
-- the document instead of reading the whole history table, which only grows.
create index document_events_document on public.document_events (document_id, id desc);
-- Removing a vendor clears the link on its documents: find them without reading every document
create index documents_vendor on public.documents (vendor_id) where vendor_id is not null;
