"use client";

// Withholding tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ) for one payment, laid out like the
// Revenue Department's form: copy mark, book / number, payer (our company — the buyer on the invoice) and payee
// (the seller), the return it is filed on (ภ.ง.ด.3 or ภ.ง.ด.53), the income table (services, rent, advertising,
// transport, contract work … all go on row 5, orders under §3 เตรส), totals with the tax in Thai words, fund
// lines, how the tax was paid, the warning and the signature block. Prints as copy 1 and copy 2 (both for the
// payee); the payer keeps its own copy.

import { ChevronLeft, Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { bahtText } from "@/lib/baht-text";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { fmt } from "@/lib/money";
import { branchLabel, branchNo, digitsOnly, dmy } from "@/lib/thai-tax";
import type { Customer, LedgerDoc, Tri } from "@/lib/types";
import { hasWht, payeeForm, whtBase, whtTax } from "@/lib/wht";

const TYPE_TH: Record<string, string> = {
  service: "ค่าบริการ",
  professional: "ค่าวิชาชีพอิสระ",
  contract: "ค่าจ้างทำของ",
  rent: "ค่าเช่า",
  advertising: "ค่าโฆษณา",
  transport: "ค่าขนส่ง",
  other: "อื่น ๆ",
  "": "ค่าบริการ",
};

const FORMS = ["ภ.ง.ด.1ก", "ภ.ง.ด.1ก พิเศษ", "ภ.ง.ด.2", "ภ.ง.ด.3", "ภ.ง.ด.2ก", "ภ.ง.ด.3ก", "ภ.ง.ด.53"] as const;

const ROWS = [
  "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)",
  "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)",
  "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)",
  "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)  (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)",
  "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ",
  "6. อื่น ๆ (ระบุ)",
];

const th = (t: Tri) => t.th || t.en || t.ja;
const Box = ({ on }: { on?: boolean }) => (
  <span className="inline-grid size-3 place-items-center border border-neutral-900 align-[-2px] text-[9px] leading-none">{on ? "✓" : ""}</span>
);

function Party({ title, name, taxId, branch, address }: { title: string; name: string; taxId: string; branch: string; address: string }) {
  return (
    <div className="grid gap-1 border border-neutral-900 p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span>
          เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* <span className="mono font-semibold tracking-[0.15em]">{taxId || "…………………………"}</span>
        </span>
      </div>
      <div>
        ชื่อ <span className="font-semibold">{name || "……………………………………………"}</span>
        {branch && <span className="ml-3 text-neutral-600">({branch})</span>}
      </div>
      <div>
        ที่อยู่ <span>{address || "……………………………………………………………………………"}</span>
      </div>
    </div>
  );
}

function Copy({ doc, payer, copy }: { doc: LedgerDoc; payer: Customer; copy: 1 | 2 }) {
  const form = payeeForm(doc.seller.taxId);
  const paid = whtBase(doc.totals);
  const tax = whtTax(doc);
  const row = doc.whtType === "other" ? 5 : 4; // index: row 5 (§3 เตรส orders) or row 6 (other)
  const payerBranch = branchNo(payer.branch);
  const payeeBranch = branchNo(doc.seller.branch);
  return (
    <section className="wht-copy grid gap-2 text-[10px] leading-snug text-neutral-900">
      <div className="flex items-start justify-between gap-4">
        <p className="text-neutral-700">
          {copy === 1 ? "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)" : "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"}
        </p>
        <p className="whitespace-nowrap">เล่มที่ ………… เลขที่ …………</p>
      </div>
      <h1 className="text-center text-[14px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
      <p className="-mt-1 text-center">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>

      <Party
        title="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :"
        name={th(payer.name)}
        taxId={digitsOnly(payer.taxId)}
        branch={payerBranch ? branchLabel(payerBranch, "th") : ""}
        address={th(payer.address)}
      />
      <Party
        title="ผู้ถูกหักภาษี ณ ที่จ่าย :"
        name={th(doc.seller.name)}
        taxId={digitsOnly(doc.seller.taxId)}
        branch={payeeBranch ? branchLabel(payeeBranch, "th") : ""}
        address={th(doc.seller.address)}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-neutral-900 p-2">
        <span>ลำดับที่ ………… ในแบบ</span>
        {FORMS.map((f, i) => (
          <span key={f} className="inline-flex items-center gap-1 whitespace-nowrap">
            <Box on={(form === "53" && f === "ภ.ง.ด.53") || (form === "3" && f === "ภ.ง.ด.3")} />({i + 1}) {f}
          </span>
        ))}
      </div>

      <table className="w-full border-collapse border border-neutral-900">
        <thead>
          <tr className="border-b border-neutral-900">
            <th className="border-r border-neutral-900 px-2 py-1 text-left font-semibold">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="w-24 border-r border-neutral-900 px-2 py-1 font-semibold">วัน เดือน หรือปีภาษี ที่จ่าย</th>
            <th className="w-28 border-r border-neutral-900 px-2 py-1 text-right font-semibold">จำนวนเงินที่จ่าย</th>
            <th className="w-28 px-2 py-1 text-right font-semibold">ภาษีที่หัก และนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((label, i) => (
            <tr key={label} className="border-b border-neutral-300 align-top">
              <td className="border-r border-neutral-900 px-2 py-1">
                {label}
                {i === row && <span className="mt-0.5 block font-semibold">— {TYPE_TH[doc.whtType]}{doc.whtRate ? ` ${fmt(doc.whtRate)}%` : ""}</span>}
              </td>
              <td className="border-r border-neutral-900 px-2 py-1 text-center tabular-nums">{i === row ? dmy(doc.paidDate) || "…………" : ""}</td>
              <td className="border-r border-neutral-900 px-2 py-1 text-right tabular-nums">{i === row ? fmt(paid) : ""}</td>
              <td className="px-2 py-1 text-right tabular-nums">{i === row ? fmt(tax) : ""}</td>
            </tr>
          ))}
          <tr className="border-t border-neutral-900 font-semibold">
            <td colSpan={2} className="border-r border-neutral-900 px-2 py-1 text-right">
              รวมเงินที่จ่ายและภาษีที่หักนำส่ง
            </td>
            <td className="border-r border-neutral-900 px-2 py-1 text-right tabular-nums">{fmt(paid)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{fmt(tax)}</td>
          </tr>
          <tr className="border-t border-neutral-900">
            <td colSpan={4} className="px-2 py-1">
              รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span className="font-semibold">({bahtText(tax)})</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p className="border border-neutral-900 p-2">
        เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ………… บาท · กองทุนประกันสังคม ………… บาท · กองทุนสำรองเลี้ยงชีพ ………… บาท
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-neutral-900 p-2">
        <span className="font-semibold">ผู้จ่ายเงิน</span>
        <span className="inline-flex items-center gap-1"><Box on />(1) หัก ณ ที่จ่าย</span>
        <span className="inline-flex items-center gap-1"><Box />(2) ออกให้ตลอดไป</span>
        <span className="inline-flex items-center gap-1"><Box />(3) ออกให้ครั้งเดียว</span>
        <span className="inline-flex items-center gap-1"><Box />(4) อื่น ๆ (ระบุ) …………</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border border-neutral-900 p-2">
        <p className="text-[9px] leading-relaxed">
          <span className="font-semibold">คำเตือน</span> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
          ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
        </p>
        <div className="grid gap-2 text-center">
          <p>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
          <p className="pt-5">ลงชื่อ ……………………………………… ผู้จ่ายเงิน</p>
          <p>
            {dmy(doc.paidDate) || "………… / ………… / …………"} <span className="text-neutral-600">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</span>
          </p>
          <p className="text-neutral-600">ประทับตรานิติบุคคล (ถ้ามี)</p>
        </div>
      </div>
      <p className="text-[8.5px] text-neutral-600">
        หมายเหตุ * เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล
        ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
      </p>
    </section>
  );
}

export function WhtCertificate({ id }: { id: string }) {
  const t = useTranslations("whtDoc");
  const { entries, loaded } = useLedger();
  const company = useCompany();
  const entry = entries.find((e) => e.id === id);
  // The payer is our company: this invoice's buyer block when it is addressed to us, else the latest one that is
  const ours = digitsOnly(company.taxId);
  const isOurs = (c: Customer) => !!ours && digitsOnly(c.taxId) === ours;
  const payer =
    entry && isOurs(entry.doc.customer)
      ? entry.doc.customer
      : ([...pick(entries, "ledger")].reverse().find((e) => isOurs(e.doc.customer))?.doc.customer ??
        entry?.doc.customer ?? { code: "", name: { th: "", en: "", ja: "" }, taxId: ours, branch: { th: "", en: "", ja: "" }, address: { th: "", en: "", ja: "" } });

  useEffect(() => {
    const prev = document.title;
    document.title = t("title");
    return () => void (document.title = prev);
  }, [t]);

  if (!loaded) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (!entry || !hasWht(entry.doc)) {
    return (
      <div className="grid justify-items-center gap-4 py-20 text-center">
        <p className="text-[15px] text-muted-foreground">{t("none")}</p>
        <Button asChild variant="secondary" className="rounded-full">
          <Link href={entry ? `/documents/${id}` : "/ledger"}>{t("back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[820px] gap-4">
      <style>{`@media print { @page { size: A4; margin: 10mm; } .wht-copy + .wht-copy { break-before: page; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost" className="-ml-3 rounded-full text-primary">
          <Link href={`/documents/${id}`}>
            <ChevronLeft className="size-4" />
            {t("back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {!entry.doc.paid && <span className="text-xs text-warn">{t("unpaid")}</span>}
          <Button type="button" className="rounded-full" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
        </div>
      </div>
      <article className="report-paper grid gap-10 border border-neutral-200 bg-white p-5 shadow-sm sm:p-8 print:gap-0 print:border-0 print:p-0 print:shadow-none">
        <Copy doc={entry.doc} payer={payer} copy={1} />
        <Copy doc={entry.doc} payer={payer} copy={2} />
      </article>
    </div>
  );
}
