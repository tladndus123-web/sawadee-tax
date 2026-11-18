// Any address under a language that is no page: the language's own "not found" (app/[locale]/not-found.tsx) instead of
// Next's English default (feedback 2026-11-18).
import { notFound } from "next/navigation";

export default function Missing() {
  notFound();
}
