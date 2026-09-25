import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { LoginBackdrop } from "@/components/auth/LoginBackdrop";
import { LoginForm } from "@/components/auth/LoginForm";
import type { Locale } from "@/i18n/routing";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <main className="relative isolate grid min-h-dvh place-items-center px-4 py-12">
      <LoginBackdrop />
      {/* LoginForm reads ?next= (useSearchParams), which needs a Suspense boundary for the static build */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
