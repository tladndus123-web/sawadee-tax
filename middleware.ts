import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Pages that work without signing in: the login form and the magic-link landing page */
const PUBLIC = new Set(["login", "auth"]);

export default async function middleware(req: NextRequest) {
  const res = intl(req);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  // Refresh the session cookie on every page request (Supabase SSR pattern)
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [, locale, section] = req.nextUrl.pathname.split("/");
  const localized = (routing.locales as readonly string[]).includes(locale);
  if (!user && localized && !PUBLIC.has(section ?? "")) {
    const to = new URL(`/${locale}/login`, req.url);
    to.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    const redirect = NextResponse.redirect(to);
    for (const c of res.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return res;
}

export const config = {
  // Skip API routes, Next internals and static files
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
