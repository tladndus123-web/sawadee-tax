"use client";

// Audit trail (public.document_events, written by a database trigger): who uploaded, edited,
// deleted or restored which document, and when.

import { supabaseBrowser } from "./supabase/client";

export type ActivityAction = "create" | "update" | "delete" | "restore";

export interface Activity {
  id: number;
  documentId: string;
  action: ActivityAction;
  at: string;
  who: string | null;
  reason: string | null;
  docNo: string;
  seller: string;
}

export async function loadActivity(opts: { documentId?: string; limit?: number } = {}): Promise<Activity[]> {
  const supabase = supabaseBrowser();
  let q = supabase
    .from("document_events")
    .select("id, document_id, action, at, user_id, detail, documents(doc_no, seller)")
    .order("id", { ascending: false })
    .limit(opts.limit ?? 12);
  if (opts.documentId) q = q.eq("document_id", opts.documentId);
  const [{ data, error }, { data: members }] = await Promise.all([q, supabase.from("members").select("user_id, name, email")]);
  if (error) throw error;
  const who = new Map((members ?? []).map((m) => [m.user_id as string, (m.name as string) || (m.email as string)]));
  return (data ?? []).map((e) => {
    // documents is null when RLS hides the document (e.g. staff and a deleted one)
    const d = (Array.isArray(e.documents) ? e.documents[0] : e.documents) as { doc_no?: string; seller?: { name?: { th?: string; en?: string } } } | null;
    return {
      id: e.id as number,
      documentId: e.document_id as string,
      action: e.action as ActivityAction,
      at: e.at as string,
      who: e.user_id ? (who.get(e.user_id as string) ?? null) : null,
      reason: ((e.detail as { reason?: string } | null)?.reason as string) ?? null,
      docNo: d?.doc_no ?? "",
      seller: d?.seller?.name?.en || d?.seller?.name?.th || "",
    };
  });
}
