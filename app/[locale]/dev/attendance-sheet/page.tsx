import { notFound } from "next/navigation";
import { AttendanceSheetPreview } from "@/components/payroll/AttendanceSheetPreview";

/** Example attendance sheet for local checks. The live site does not serve this page. */
export default function AttendanceSheetPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AttendanceSheetPreview />;
}
