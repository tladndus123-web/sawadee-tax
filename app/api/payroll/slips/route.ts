// Payslips to employees on LINE (owner, 2026-10-13). Admins only: the month's saved pay of the given employees, one
// text message each (lib/payslip-text), pushed to the LINE account the employee linked through the bot. Employees
// without a link, or with nothing paid that month, are named in the answer so the admin can hand them a PDF instead.

import { endIfExpired } from "@/lib/auth/session-guard";
import { lineClient } from "@/lib/line";
import { payslipText, type SlipHalf } from "@/lib/payslip-text";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const hits = new Map<string, number[]>();
/** At most 10 sends a minute per admin (each push counts against the LINE quota) */
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

type Line = { employee_id: string; period: 1 | 2; gross: number | string; ss_employee: number | string; wht: number | string; other_deduction: number | string; net: number | string; paid_on: string | null; pay_type: "monthly" | "daily"; rate: number | string };
const n = (v: number | string) => Number(v) || 0;

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await endIfExpired(supabase))) return Response.json({ error: "signin" }, { status: 401 });
  const { data: me } = await supabase.from("members").select("role, disabled_at").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin" || me.disabled_at) return Response.json({ error: "forbidden" }, { status: 403 });
  if (limited(user.id)) return Response.json({ error: "rate" }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { month?: string; employeeIds?: string[] };
  const month = String(body.month ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "badMonth" }, { status: 400 });
  const ids = Array.isArray(body.employeeIds) ? body.employeeIds.filter((x) => typeof x === "string").slice(0, 200) : null;

  const admin = supabaseAdmin();
  let q = admin.from("employees").select("id, name, line_user_id");
  if (ids) q = q.in("id", ids);
  const [{ data: employees, error: e1 }, { data: lines, error: e2 }, { data: company }] = await Promise.all([
    q,
    admin.from("payroll_lines").select("employee_id, period, gross, ss_employee, wht, other_deduction, net, paid_on, pay_type, rate").eq("month", month),
    admin.from("company_settings").select("name").eq("id", 1).maybeSingle(),
  ]);
  if (e1 || e2) return Response.json({ error: "db" }, { status: 500 });
  const name = (company?.name ?? {}) as { th?: string; en?: string };
  const companyName = name.th || name.en || "";

  const sent: string[] = [];
  const notLinked: string[] = [];
  const noPay: string[] = [];
  const failed: string[] = [];
  const client = lineClient();
  for (const e of (employees ?? []) as { id: string; name: string; line_user_id: string | null }[]) {
    const mine = ((lines ?? []) as Line[]).filter((l) => l.employee_id === e.id);
    const half = (p: 1 | 2): SlipHalf | null => {
      const l = mine.find((x) => Number(x.period) === p);
      return l ? { gross: n(l.gross), ssEmployee: n(l.ss_employee), wht: n(l.wht), otherDeduction: n(l.other_deduction), net: n(l.net), paidOn: l.paid_on ?? "" } : null;
    };
    const first = half(1);
    const second = half(2);
    if (!mine.length || !(first?.gross || second?.gross)) {
      noPay.push(e.name);
      continue;
    }
    if (!e.line_user_id) {
      notLinked.push(e.name);
      continue;
    }
    const any = mine[0];
    const text = payslipText({ company: companyName, employee: e.name, month, payType: any.pay_type, rate: n(any.rate), first, second });
    try {
      await client.pushMessage({ to: e.line_user_id, messages: [{ type: "text", text }] });
      sent.push(e.name);
    } catch (err) {
      console.error("[slips] push failed", e.id, err instanceof Error ? err.message : err);
      failed.push(e.name);
    }
  }
  return Response.json({ sent, notLinked, noPay, failed });
}
