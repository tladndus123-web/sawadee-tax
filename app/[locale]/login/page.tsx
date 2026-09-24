import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import type { Locale } from "@/i18n/routing";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <LoginForm />
    </main>
  );
}
