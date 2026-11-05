import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { LoginBackdrop } from "@/components/auth/LoginBackdrop";
import { LoginForm } from "@/components/auth/LoginForm";
import type { Locale } from "@/i18n/routing";
import { LOGIN_STAY_COOKIE, loginShouldEnter } from "@/lib/auth/login-entrance";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  // Language changes set this cookie first, so the card does not rise in again
  const enter = loginShouldEnter((await cookies()).get(LOGIN_STAY_COOKIE)?.value);
  return (
    <main className="relative isolate grid min-h-dvh place-items-center px-4 py-12">
      <LoginBackdrop enter={enter} />
      {/* LoginForm reads ?next= (useSearchParams), which needs a Suspense boundary for the static build */}
      <Suspense>
        <LoginForm enter={enter} />
      </Suspense>
    </main>
  );
}
