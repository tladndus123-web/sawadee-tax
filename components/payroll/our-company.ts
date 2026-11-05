"use client";

// Our company as the filing lists and payslips print it: the tax ID from the settings; the name, address and branch
// number as typed in the settings (owner, 2026-11-06), else as the latest invoice addressed to us printed them (a chosen
// branch's number first).

import { useMemo } from "react";
import { ALL, byId } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { branchNo, digitsOnly } from "@/lib/thai-tax";

export function useOurCompany(): { loaded: boolean; taxId: string; name: string; branchNo: string; address: string } {
  const company = useCompany();
  const { entries } = useLedger();
  const working = useBranch();
  const { branches } = useBranches();
  const workingNo = working !== ALL ? byId(branches, working)?.no : undefined;
  return useMemo(() => {
    const id = digitsOnly(company.taxId);
    const d = id
      ? pick(entries, "ledger")
          .map((e) => e.doc)
          .filter((x) => digitsOnly(x.customer.taxId) === id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
      : undefined;
    return {
      loaded: company.loaded,
      taxId: id,
      name: company.name.th || company.name.en || d?.customer.name.th || d?.customer.name.en || "",
      address: company.address.th || company.address.en || d?.customer.address.th || d?.customer.address.en || "",
      branchNo: workingNo ?? (/^\d{5}$/.test(company.branch) ? company.branch : undefined) ?? branchNo(d?.customer.branch) ?? "",
    };
  }, [company.loaded, company.taxId, company.name, company.address, company.branch, entries, workingNo]);
}
