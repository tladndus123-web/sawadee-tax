"use client";

// Start the dashboard's data as soon as an admin is signed in (feedback 2026-11-18: "대시보드 첫 화면이 약 9초"): the
// stores used to start only once the branch gate had let the page through, one wait after another. They read every
// branch and pick the chosen one in the browser, so starting them early shows nothing more than the page will. Renders
// nothing; the stores are shared, so the dashboard finds them loading or loaded.

import { useCompany } from "@/lib/company-store";
import { useCostLines } from "@/lib/cash-store";
import { useLabor } from "@/lib/labor-store";
import { useLedger } from "@/lib/ledger-store";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useMe } from "@/lib/role-store";
import { useSales } from "@/lib/sales-store";
import { useStock } from "@/lib/stock-store";

export function Warmup() {
  const me = useMe();
  return me.loaded && me.role === "admin" ? <AdminData /> : null;
}

function AdminData() {
  useLedger();
  useSales();
  useCompany();
  useLabor();
  useCostLines();
  useStock();
  useMonthLocks();
  return null;
}
