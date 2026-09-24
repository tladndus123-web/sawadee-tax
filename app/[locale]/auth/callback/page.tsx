import { setRequestLocale } from "next-intl/server";
import { AuthCallback } from "@/components/auth/AuthCallback";
import type { Locale } from "@/i18n/routing";

// Landing page of the magic link / invite link. Runs in the browser so it can read both
// ?code= (PKCE sign-in links) and #access_token= (admin invite links).
export default async function CallbackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <AuthCallback />
    </main>
  );
}
