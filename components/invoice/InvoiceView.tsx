"use client";

import type { BlockKey } from "@/lib/form-config";
import { type FormMode, copyKindTri, docTypeTri, joinTri, pickTri } from "@/lib/form-labels";
import { triHas } from "@/lib/normalize";
import { dmy } from "@/lib/thai-tax";
import type { LedgerDoc } from "@/lib/types";
import { Box, Chip, FieldLabel, Kv, Mono } from "./fields";
import { useFormConfig, useFormLabels } from "./form-config-context";
import { ItemsTableView } from "./ItemsTable";
import { SignBoxesView } from "./SignBoxes";
import { TotalsLadderView } from "./TotalsLadder";
import { TriText } from "./TriText";

/**
 * Organized form, read-only. Default layout follows the original paper (prototype invoiceView order):
 * header (seller + doc box) · title · parties (customer / conditions) · items
 * · bottom (delivery, terms, note / totals) · words · signs · footer (form code).
 * The company form settings can reorder blocks, hide some, hide fields and rename labels.
 */
export function InvoiceView({
  doc: r,
  mode,
  onUnsure,
  signable,
}: {
  doc: LedgerDoc;
  mode: FormMode;
  /** Inside the document form: signature boxes can be typed into / ticked without edit mode */
  signable?: boolean;
  /** Called with the field path when an "unclear" badge is clicked */
  onUnsure?: (path: string) => void;
}) {
  const cfg = useFormConfig();
  const { join, show } = useFormLabels();
  const un = new Set(r.unclear);
  const U = (p: string) => un.has(p);
  const jump = (p: string) => (onUnsure ? () => onUnsure(p) : undefined);
  const s = r.seller;
  const c = r.customer;
  const dv = r.delivery;

  const blocks: Record<BlockKey, () => React.ReactNode> = {
    header: () => (
      <div className="grid items-start gap-4 @2xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid min-w-0 gap-1.5">
          <TriText value={s.name} mode={mode} unsure={U("seller.name")} onUnsure={jump("seller.name")} primaryClassName="text-base font-semibold" />
          {show("sellerAddress") && triHas(s.address) && (
            <div className="grid gap-0.5 text-[12.5px] text-muted-foreground">
              <FieldLabel k="headOffice" mode={mode} />
              <TriText value={s.address} mode={mode} unsure={U("seller.address")} onUnsure={jump("seller.address")} />
            </div>
          )}
          {show("sellerContact") && (s.tel || s.fax) && (
            <p className="mono text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
              {join("tel", mode)}: {s.tel || "—"} &nbsp; {join("fax", mode)}: {s.fax || "—"}
            </p>
          )}
          {show("saleOffice") && s.saleOffice && (
            <p className="mono text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
              {join("saleOffice", mode)}: {s.saleOffice}
            </p>
          )}
          <Kv k="taxId" mode={mode} className="mt-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <Mono className="whitespace-nowrap">{s.taxId}</Mono>
              {show("branchCode") && s.branchCode && <Chip className="mono">{s.branchCode}</Chip>}
            </span>
          </Kv>
        </div>

        <div className="@container grid border border-rule">
          {show("formSerial") && r.formSerial && (
            <div className="mono border-b border-rule px-3 py-1.5 text-right text-lg font-semibold text-brand">{r.formSerial}</div>
          )}
          <div className="grid gap-2 px-3 py-2.5">
            <Kv k="docNo" mode={mode}>
              <Mono className="whitespace-nowrap">{r.docNo}</Mono>
            </Kv>
            <Kv k="date" mode={mode}>
              <Mono>{dmy(r.date)}</Mono>
            </Kv>
            {show("docTypeChip") && (
              <div>
                <Chip tone={r.docType === "full" ? "brand" : undefined} className="whitespace-normal">
                  {joinTri(docTypeTri(r.docType), mode)}
                </Chip>
              </div>
            )}
          </div>
        </div>
      </div>
    ),

    title: () => {
      const showCopy = show("copyKind") && r.copyKind !== "unknown";
      const titles = pickTri(r.docTitle, mode).slice(0, show("docTitleSub") ? undefined : 1);
      if (!showCopy && !titles.length) return null;
      return (
        <div className="grid justify-items-center gap-0.5 py-1 text-center">
          {showCopy && <span className="text-xs font-semibold tracking-widest text-brand">{joinTri(copyKindTri(r.copyKind), mode, "  ·  ")}</span>}
          {titles.map(([lg, x], i) => (
            <span key={lg} lang={lg} className={i ? "text-muted-foreground" : "text-lg font-semibold"}>
              {x}
            </span>
          ))}
        </div>
      );
    },

    parties: () => (
      <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Box>
          <Kv k="customer" mode={mode}>
            <TriText value={c.name} mode={mode} unsure={U("customer.name")} onUnsure={jump("customer.name")} />
          </Kv>
          {show("custCode") && c.code && (
            <Kv k="custCode" mode={mode}>
              <Mono>{c.code}</Mono>
            </Kv>
          )}
          <Kv k="taxId" mode={mode}>
            <span className="flex flex-wrap items-center gap-1.5">
              <Mono className="whitespace-nowrap">{c.taxId}</Mono>
              {show("customerBranch") && triHas(c.branch) && <Chip>{joinTri(c.branch, mode)}</Chip>}
            </span>
          </Kv>
          {show("customerAddress") && triHas(c.address) && (
            <Kv k="address" mode={mode}>
              <TriText value={c.address} mode={mode} unsure={U("customer.address")} onUnsure={jump("customer.address")} />
            </Kv>
          )}
        </Box>
        <Box>
          {show("orderNo") && (
            <Kv k="orderNo" mode={mode}>
              <Mono>{r.orderNo}</Mono>
            </Kv>
          )}
          {show("term") && (
            <Kv k="term" mode={mode}>
              <TriText value={r.term} mode={mode} />
            </Kv>
          )}
          {show("due") && (
            <Kv k="due" mode={mode}>
              <Mono>{dmy(r.dueDate)}</Mono>
            </Kv>
          )}
          {(triHas(r.sales.name) || r.sales.ref) && (
            <Kv k="sales" mode={mode}>
              <span className="grid gap-1">
                <TriText value={r.sales.name} mode={mode} unsure={U("sales.name")} onUnsure={jump("sales.name")} />
                {show("salesArea") && triHas(r.sales.area) && <TriText value={r.sales.area} mode={mode} />}
                {show("salesRef") && r.sales.ref && <Mono className="text-[13px] text-muted-foreground">{r.sales.ref}</Mono>}
              </span>
            </Kv>
          )}
        </Box>
      </div>
    ),

    items: () => <ItemsTableView items={r.items} mode={mode} unsure={U} onUnsure={onUnsure} />,

    bottom: () => {
      const hasDelivery = show("delivery") && (triHas(dv.note) || triHas(dv.place) || !!dv.contact);
      const hasTerms = show("terms") && r.terms.length > 0;
      const hasNote = show("note") && triHas(r.note);
      const ladder = <TotalsLadderView totals={r.totals} mode={mode} />;
      if (!hasDelivery && !hasTerms && !hasNote) {
        return <div className="grid @2xl:grid-cols-[minmax(0,1fr)_330px]"><div className="@2xl:col-start-2">{ladder}</div></div>;
      }
      return (
        <div className="grid items-start gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid gap-2.5">
            {hasDelivery && (
              <Box>
                <Kv k="delivery" mode={mode}>
                  <span className="grid gap-1">
                    <TriText value={dv.note} mode={mode} />
                    <TriText value={dv.place} mode={mode} />
                    {(dv.contact || triHas(dv.person)) && (
                      <span className="text-[13px]">
                        <Mono>{dv.contact}</Mono> {joinTri(dv.person, mode, " / ")}
                      </span>
                    )}
                  </span>
                </Kv>
              </Box>
            )}
            {hasTerms && (
              <Box className="text-[12.5px] text-muted-foreground">
                <FieldLabel k="terms" mode={mode} />
                <ul className="grid list-disc gap-1.5 pl-4">
                  {r.terms.map((x, i) => (
                    <li key={i}>
                      <TriText value={x} mode={mode} />
                    </li>
                  ))}
                </ul>
              </Box>
            )}
            {hasNote && (
              <Box>
                <Kv k="note" mode={mode}>
                  <TriText value={r.note} mode={mode} />
                </Kv>
              </Box>
            )}
          </div>
          {ladder}
        </div>
      );
    },

    // Thai words as printed; English and Japanese are the same digits, so show them once
    words: () => {
      if (!triHas(r.words)) return null;
      const digits = r.words.en || r.words.ja;
      const showTh = (mode === "all" || mode === "th") && !!r.words.th;
      const showDigits = mode !== "th" && !!digits;
      return (
        <div className="border border-rule bg-band px-3 py-2.5 text-center">
          {showTh && (
            <span lang="th" className="block font-semibold">
              {r.words.th}
            </span>
          )}
          {showDigits && <span className={showTh ? "mono block text-[13px] text-muted-foreground" : "mono block font-semibold"}>{digits}</span>}
        </div>
      );
    },

    signs: () => <SignBoxesView signs={r.signs} mode={mode} signable={signable} />,

    footer: () =>
      r.formCode || r.formSince ? (
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{r.formSince ? `${join("since", mode, " / ")} ${r.formSince}` : ""}</span>
          <span className="mono">{r.formCode}</span>
        </div>
      ) : null,
  };

  const hiddenBlocks = new Set(cfg.hiddenBlocks);
  return (
    <article className="invoice-paper @container grid gap-5 rounded-xl border border-rule bg-card p-4 text-sm sm:p-6" aria-label={joinTri(r.docTitle, "en") || "Document"}>
      {cfg.order
        .filter((b) => !hiddenBlocks.has(b))
        .map((b) => {
          const node = blocks[b]();
          return node ? (
            <div key={b} className="min-w-0">
              {node}
            </div>
          ) : null;
        })}
    </article>
  );
}
