"use client";

import { useTranslations } from "next-intl";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { copyKindTri, docTypeTri, type FormMode } from "@/lib/form-labels";
import { baht } from "@/lib/money";
import { COPY_KINDS, DOC_TYPES, type LedgerDoc } from "@/lib/types";
import { Box, Kv } from "./fields";
import { DateIn, NumIn, TextIn } from "./form-inputs";
import { ItemsTableEdit } from "./ItemsTable";
import { SignBoxesEdit } from "./SignBoxes";
import { TotalsLadderEdit } from "./TotalsLadder";
import { TriInput } from "./TriInput";

/** Organized form, edit mode. Same layout as InvoiceView, with inputs in each box. */
export function InvoiceEdit({ mode }: { mode: FormMode }) {
  const t = useTranslations();
  const { control } = useFormContext<LedgerDoc>();
  const net = useWatch({ control, name: "totals.net" });
  const L = (k: Parameters<typeof t>[0]) => t(k);
  const E = { mode, edit: true } as const;

  return (
    <article className="invoice-paper @container grid gap-5 rounded-xl border border-rule bg-card p-4 text-sm sm:p-6">
      {/* 1 + 2 */}
      <div className="grid items-start gap-4 @2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-2">
          <TriInput name="seller.name" label={L("labels.seller")} />
          <Kv k="headOffice" {...E}>
            <TriInput name="seller.address" label={L("labels.address")} />
          </Kv>
          <Kv k="tel" {...E}>
            <div className="grid grid-cols-2 gap-1.5">
              <TextIn name="seller.tel" label={L("labels.tel")} mono />
              <TextIn name="seller.fax" label={L("labels.fax")} mono />
            </div>
          </Kv>
          <Kv k="saleOffice" {...E}>
            <TextIn name="seller.saleOffice" label={L("labels.saleOffice")} mono />
          </Kv>
          <Kv k="taxId" {...E}>
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-1.5">
              <TextIn name="seller.taxId" label={L("labels.taxId")} mono digits maxLength={13} />
              <TextIn name="seller.branchCode" label={L("labels.branchCode")} mono />
            </div>
          </Kv>
        </div>
        <Box className="gap-2">
          <Kv k="serial" {...E}>
            <TextIn name="formSerial" label={L("labels.serial")} mono />
          </Kv>
          <Kv k="docNo" {...E}>
            <TextIn name="docNo" label={L("labels.docNo")} mono />
          </Kv>
          <Kv k="date" {...E}>
            <DateIn name="date" label={L("labels.date")} />
          </Kv>
          <Kv k="docType" {...E}>
            <Controller
              control={control}
              name="docType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger size="sm" className="w-full" aria-label={L("labels.docType")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`docType.${k}`)} · <span lang="th">{docTypeTri(k).th}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Kv>
          <Kv k="copy" {...E}>
            <Controller
              control={control}
              name="copyKind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger size="sm" className="w-full" aria-label={L("labels.copy")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COPY_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k === "unknown" ? "—" : `${copyKindTri(k).th} · ${copyKindTri(k).en}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Kv>
        </Box>
      </div>

      {/* 3 */}
      <Box>
        <Kv k="docTitle" {...E}>
          <TriInput name="docTitle" label={L("labels.docTitle")} />
        </Kv>
      </Box>

      {/* 4 */}
      <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Box>
          <Kv k="customer" {...E}>
            <TriInput name="customer.name" label={L("labels.customer")} />
          </Kv>
          <Kv k="custCode" {...E}>
            <TextIn name="customer.code" label={L("labels.custCode")} mono />
          </Kv>
          <Kv k="taxId" {...E}>
            <TextIn name="customer.taxId" label={L("labels.taxId")} mono digits maxLength={13} />
          </Kv>
          <Kv k="branch" {...E}>
            <TriInput name="customer.branch" label={L("labels.branch")} />
          </Kv>
          <Kv k="address" {...E}>
            <TriInput name="customer.address" label={L("labels.address")} />
          </Kv>
        </Box>
        <Box>
          <Kv k="orderNo" {...E}>
            <TextIn name="orderNo" label={L("labels.orderNo")} mono />
          </Kv>
          <Kv k="term" {...E}>
            <TriInput name="term" label={L("labels.term")} />
          </Kv>
          <Kv k="creditDays" {...E}>
            <NumIn name="creditDays" label={L("labels.creditDays")} decimals={false} className="sm:w-24" />
          </Kv>
          <Kv k="due" {...E}>
            <DateIn name="dueDate" label={L("labels.due")} />
          </Kv>
          <Kv k="sales" {...E}>
            <TriInput name="sales.name" label={L("labels.sales")} />
          </Kv>
          <Kv k="salesArea" {...E}>
            <TriInput name="sales.area" label={L("labels.salesArea")} />
          </Kv>
          <Kv k="salesRef" {...E}>
            <TextIn name="sales.ref" label={L("labels.salesRef")} mono />
          </Kv>
        </Box>
      </div>

      {/* 5 */}
      <ItemsTableEdit mode={mode} />

      {/* 6 */}
      <div className="grid items-start gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2.5">
          <Box>
            <Kv k="delivery" {...E}>
              <div className="grid gap-2">
                <TriInput name="delivery.note" label={L("labels.delivery")} />
                <TriInput name="delivery.place" label={L("labels.delivery")} />
              </div>
            </Kv>
            <Kv k="contact" {...E}>
              <TextIn name="delivery.contact" label={L("labels.contact")} mono />
            </Kv>
            <Kv k="person" {...E}>
              <TriInput name="delivery.person" label={L("labels.person")} />
            </Kv>
          </Box>
          <Box>
            <Kv k="wordsPrinted" {...E}>
              <TextIn name="wordsPrinted" label={L("labels.wordsPrinted")} lang="th" />
            </Kv>
            <Kv k="words" {...E}>
              <div className="grid gap-1">
                <TextIn name="words.th" label={L("labels.words")} lang="th" />
                {/* English / Japanese are generated from the net amount */}
                <p className="num text-left text-xs text-muted-foreground">EN · JA: {baht(net ?? 0)}</p>
              </div>
            </Kv>
          </Box>
          <Box>
            <Kv k="note" {...E}>
              <TriInput name="note" label={L("labels.note")} />
            </Kv>
          </Box>
        </div>
        <TotalsLadderEdit mode={mode} />
      </div>

      {/* 8 */}
      <SignBoxesEdit mode={mode} />
    </article>
  );
}
