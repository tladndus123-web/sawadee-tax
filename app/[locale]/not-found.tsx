// "Page not found" in the reader's language (feedback 2026-11-18: the 404 was English in every language)
import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center justify-items-center gap-4 px-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted" aria-hidden>
        <SearchX className="size-6 text-muted-foreground" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("body")}</p>
      <Button asChild className="h-11 rounded-full px-5">
        <Link href="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
