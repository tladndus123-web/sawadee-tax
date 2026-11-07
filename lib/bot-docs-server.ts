// A receipt an AI agent got (an emailed e-tax invoice turned into a picture, a photo) → the same AI reading and tidying
// as a LINE photo (vendor dictionary, last category, payment terms, branch from the invoice, automatic checks) → saved as
// a DRAFT by the owner who connected the agent (bot_save_document, …004200). A person opens it, checks and saves.
// Reading costs the same as any upload (Claude).

import crypto from "node:crypto";
import { paidAtTill } from "./archive";
import { assignBranch, type Branch, branchFromPhoto, sortBranches } from "./branches";
import { type LedgerRef, runChecks } from "./checks";
import { docToRow } from "./db-map";
import { extractDocument, MAX_IMAGE_BYTES } from "./extract-server";
import { imageType } from "./line";
import type { Admin } from "./line-ask-server";
import { findDuplicate } from "./photo-hash";
import { photoHashServer } from "./photo-hash-server";
import { applyHistory, applyRule, applyVendor, toVendor, type VendorHistory, type VendorRow, VENDOR_COLUMNS, vendorKey } from "./vendors";

export type AddResult =
  | { added: true; id: string; supplier: string; date: string; total: number; warnings: string[]; open: string; status: "draft" }
  | { added: false; reason: string; open?: string };

/** Base64 (optionally a data: URL) → bytes, or null when it is not base64 */
export function fromBase64(s: string): Buffer | null {
  const body = s.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  return Buffer.from(body, "base64");
}

export async function addDocumentFromFile(admin: Admin, ownerId: string, file: Buffer, note: string, appUrl: string): Promise<AddResult> {
  // A leaked key must not run up the AI bill: at most 30 readings an hour per owner (counted in the database, so it holds
  // across servers); a person uploading in the app is not counted (no "Grok Bot" memo)
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("documents").select("id", { count: "exact", head: true }).eq("created_by", ownerId).gte("created_at", since).ilike("memo", "Grok Bot%");
  if ((count ?? 0) >= 30) return { added: false, reason: "Already 30 receipts in the last hour. Try again later." };
  const type = imageType(file);
  if (!type) return { added: false, reason: "Send a JPEG, PNG or WebP picture. For a PDF, send each page as a picture." };
  if (file.length > MAX_IMAGE_BYTES) return { added: false, reason: "The picture is over 4.5 MB. Send a smaller one." };

  const hash = await photoHashServer(file);
  if (hash) {
    const { data: seen } = await admin.from("documents").select("id, photo_hash").not("photo_hash", "is", null).is("deleted_at", null);
    const dup = findDuplicate(hash, (seen ?? []).map((d) => ({ id: d.id as string, hash: d.photo_hash as string })));
    if (dup) return { added: false, reason: "This receipt is already in the ledger.", open: `${appUrl}/documents/${dup.id}` };
  }

  const read = await extractDocument(file, type);
  if (!read.ok) return { added: false, reason: read.code === "notDoc" ? "This is not a receipt or tax invoice." : read.code === "rate" ? "Busy. Try again in a minute." : "Could not read it. Send a clearer picture." };

  let doc = read.doc;
  const key = vendorKey(doc);
  const [company, vendor, same, rows] = await Promise.all([
    admin.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
    key ? admin.from("vendors").select(VENDOR_COLUMNS).eq("tax_id", key).maybeSingle() : null,
    doc.docNo ? admin.from("documents").select("id, doc_no, seller").eq("doc_no", doc.docNo).is("deleted_at", null) : null,
    admin.from("branches").select("id, no, name, sort"),
  ]);
  doc = applyVendor(doc, vendor?.data ? toVendor(vendor.data as VendorRow) : null).doc;
  if (vendor?.data) {
    const last = await admin
      .from("documents")
      .select("category, payment")
      .eq("vendor_id", (vendor.data as VendorRow).id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    doc = applyHistory(doc, (last.data as VendorHistory | null) ?? null).doc;
    doc = applyRule(doc, toVendor(vendor.data as VendorRow)).doc;
  }
  doc = paidAtTill(doc);
  // Always marked as the agent's (the hourly limit above counts these)
  doc = { ...doc, memo: [doc.memo, `Grok Bot${note.trim() ? `: ${note.trim().slice(0, 200)}` : ""}`].filter(Boolean).join("\n") };
  const companyTaxId = (company.data?.tax_id as string | undefined) ?? "";
  const others: LedgerRef[] = (same?.data ?? []).map((d) => ({ id: d.id as string, docNo: d.doc_no as string, sellerTaxId: ((d.seller as { taxId?: string } | null)?.taxId as string) ?? "" }));

  // An owner sees every branch: the buyer's branch number on the invoice, else the first branch
  const branches = sortBranches(((rows.data ?? []) as Branch[]).map((b) => ({ ...b, name: b.name ?? "", sort: Number(b.sort) || 0, color: "" })));
  if (branches.length) doc = assignBranch(doc, branches, branchFromPhoto(doc, branches)?.id ?? branches[0].id);

  const id = crypto.randomUUID();
  const photoPath = `${id}/${Date.now()}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const up = await admin.storage.from("documents").upload(photoPath, file, { contentType: type });
  if (up.error) throw up.error;

  const { row, items } = docToRow({ ...doc, id }, "draft", companyTaxId);
  const checks = runChecks(doc, { companyTaxId, others });
  row.flags = checks.filter((c) => !c.na && !c.ok).map((c) => c.key);
  const saved = await admin.rpc("bot_save_document", { p_user: ownerId, p_id: id, p_row: { ...row, photo_path: photoPath, ...(hash ? { photo_hash: hash } : {}) }, p_items: items });
  if (saved.error) {
    await admin.storage.from("documents").remove([photoPath]);
    throw saved.error;
  }
  return {
    added: true,
    status: "draft",
    id,
    supplier: doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja || "?",
    date: doc.date,
    total: doc.totals.net,
    warnings: row.flags as string[],
    open: `${appUrl}/documents/${id}`,
  };
}
