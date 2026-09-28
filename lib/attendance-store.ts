"use client";

// Attendance in Supabase (public.attendance, admins only): the rows of a month, loaded when a month is opened;
// one cell saved at a time. A closed month is refused by the database.

import { type AttendanceKind, type AttendanceRow } from "./attendance";
import { supabaseBrowser } from "./supabase/client";

type Raw = { employee_id: string; day: string; kind: AttendanceKind; ot_hours: number | string; note: string };

const toRow = (r: Raw): AttendanceRow => ({ employeeId: r.employee_id, day: r.day, kind: r.kind, otHours: Number(r.ot_hours) || 0, note: r.note ?? "" });

export async function loadAttendance(opts: { month?: string; year?: number }): Promise<AttendanceRow[]> {
  let q = supabaseBrowser().from("attendance").select("employee_id, day, kind, ot_hours, note");
  if (opts.month) {
    const next = new Date(Date.UTC(Number(opts.month.slice(0, 4)), Number(opts.month.slice(5, 7)), 1)).toISOString().slice(0, 10);
    q = q.gte("day", `${opts.month}-01`).lt("day", next);
  }
  if (opts.year) q = q.gte("day", `${opts.year}-01-01`).lte("day", `${opts.year}-12-31`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Raw[]).map(toRow);
}

/** One employee-day; `kind: null` clears it */
export async function saveAttendance(employeeId: string, day: string, cell: { kind: AttendanceKind; otHours: number; note?: string } | null) {
  const sb = supabaseBrowser();
  if (!cell) {
    const { error } = await sb.from("attendance").delete().eq("employee_id", employeeId).eq("day", day);
    if (error) throw error;
    return;
  }
  const { error } = await sb
    .from("attendance")
    .upsert({ employee_id: employeeId, day, kind: cell.kind, ot_hours: Math.max(0, Math.min(24, cell.otHours || 0)), note: (cell.note ?? "").slice(0, 100) }, { onConflict: "employee_id,day" });
  if (error) throw error;
}

/** Mark every unmarked day of the month as worked (the person then unmarks the days off) */
export async function fillWorked(employeeId: string, days: string[]) {
  if (!days.length) return;
  const { error } = await supabaseBrowser()
    .from("attendance")
    .upsert(
      days.map((day) => ({ employee_id: employeeId, day, kind: "work", ot_hours: 0, note: "" })),
      { onConflict: "employee_id,day", ignoreDuplicates: true },
    );
  if (error) throw error;
}
