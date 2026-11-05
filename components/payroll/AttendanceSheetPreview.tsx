"use client";

// Local preview of the real attendance screen with obvious example names. Production returns 404.
// Nothing here is a live employee.

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { AttendanceTab } from "@/components/payroll/AttendanceTab";
import type { AttendanceRow } from "@/lib/attendance";
import type { Employee } from "@/lib/payroll";

const BRANCH = "branch-example";

function person(partial: Pick<Employee, "id" | "name"> & Partial<Employee>): Employee {
  return {
    branchId: BRANCH,
    nickname: "",
    position: "",
    payType: "monthly",
    rate: 0,
    startDate: "",
    endDate: "",
    ssEnrolled: false,
    nationalId: "",
    address: "",
    extraAllowance: 0,
    whtFixed: null,
    note: "",
    documents: [],
    lineUserId: "",
    ...partial,
  };
}

const employees: Employee[] = [
  person({ id: "ko", name: "김예시길동이름이어래줄까지길어지는직원", nickname: "예시김" }),
  person({ id: "th", name: "สมชาย ใจดีตัวอย่าง", nickname: "" }),
  person({ id: "ja", name: "山田太郎サンプル", nickname: "" }),
  person({ id: "en", name: "Christopher William Alexander-Montgomery", nickname: "Chris" }),
  person({ id: "ko2", name: "박예시", nickname: "" }),
  person({ id: "th2", name: "สมหญิง ตัวอย่างยาวมาก", nickname: "", startDate: "2026-01-10" }),
];

const mark = (employeeId: string, day: string, kind: AttendanceRow["kind"], otHours = 0): AttendanceRow => ({ employeeId, day, kind, otHours, note: "" });

const rows: AttendanceRow[] = [
  mark("ko", "2026-01-02", "work", 2),
  mark("ko", "2026-01-03", "off"),
  mark("ko", "2026-01-05", "annual"),
  mark("th", "2026-01-06", "sick"),
  mark("th", "2026-01-07", "absent"),
  mark("ja", "2026-01-08", "work", 1.5),
  mark("ja", "2026-01-09", "off"),
  mark("en", "2026-01-12", "work"),
  mark("ko2", "2026-01-13", "annual"),
  mark("th2", "2026-01-15", "work", 3),
];

const yearRows: AttendanceRow[] = [mark("ko", "2026-03-02", "annual"), mark("th", "2026-04-01", "sick")];

export function AttendanceSheetPreview() {
  const t = useTranslations("pay");
  const { setTheme } = useTheme();
  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get("theme");
    if (theme === "dark" || theme === "light") setTheme(theme);
  }, [setTheme]);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("tab.attendance")} · 2026-01 · example</p>
      <AttendanceTab
        month="2026-01"
        preview={{
          employees,
          rows,
          yearRows,
          branchId: BRANCH,
          branchLabel: "예시 실롬",
          branchNames: { [BRANCH]: "예시 실롬" },
        }}
      />
    </div>
  );
}
