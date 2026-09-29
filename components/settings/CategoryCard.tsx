"use client";

// Settings → categories (admins): rename or hide the built-in ones, add the company's own. The name is typed in one
// language and translated into the other screen languages (each can be corrected); a hint tells the AI what belongs
// there; an icon and colour; whether its input VAT may be claimed. A category documents use cannot be deleted —
// hide it instead (its documents keep it).

import { ChevronDown, Eye, EyeOff, Languages, Loader2, Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon, type CategoryColor, type CategoryIconName, lookOf, useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type CategoryRow, deleteCategory, newCategoryKey, saveCategory, UI_LANGS, type UiLang, useCategories } from "@/lib/category-store";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";

type Draft = CategoryRow & { isNew?: boolean };

export function CategoryCard() {
  const t = useTranslations("cats");
  const label = useCategoryLabel();
  const isAdmin = useMe().role === "admin";
  const { rows, loaded } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Five at first; the rest one tap away
  const [all, setAll] = useState(false);
  const SHOWN = 5;

  const toggleHidden = async (r: CategoryRow) => {
    setBusy(r.key);
    try {
      await saveCategory({ ...r, hidden: !r.hidden });
      toast.success(r.hidden ? t("shown") : t("hiddenDone"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (r: CategoryRow) => {
    if (!confirm(t("deleteAsk", { name: label(r.key) }))) return;
    setBusy(r.key);
    try {
      await deleteCategory(r.key);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(/category_in_use/.test(String((e as { message?: string })?.message)) ? t("inUse") : t("fail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="cats-title" className="workspace-panel hover-lift [--lift:1.006] grid content-start gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="cats-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Shapes className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{isAdmin ? t("hint") : t("hintStaff")}</p>
      </div>

      {!loaded ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <ul className="grid divide-y divide-border/60">
          {(all ? rows : rows.slice(0, SHOWN)).map((r) => (
            <li key={r.key} className={cn("flex items-center gap-3 py-2", r.hidden && "opacity-55")}>
              <CategoryIcon category={r.key} className="size-9 rounded-xl" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[15px] font-medium">{label(r.key)}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {[r.hidden && t("hiddenTag"), r.foodCost && t("foodTag"), r.vatBlocked && t("noVatTag"), !r.builtin && t("ownTag")].filter(Boolean).join(" · ")}
                </span>
              </span>
              {isAdmin && (
                <span className="flex flex-none items-center">
                  <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("edit")} disabled={!!busy} onClick={() => setDraft({ ...r })}>
                    <Pencil className="size-4" />
                  </Button>
                  {r.key !== "other" && (
                    <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={r.hidden ? t("show") : t("hide")} disabled={!!busy} onClick={() => void toggleHidden(r)}>
                      {busy === r.key ? <Loader2 className="size-4 animate-spin" /> : r.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                  )}
                  {!r.builtin && (
                    <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-bad" aria-label={t("delete")} disabled={!!busy} onClick={() => void remove(r)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {loaded && rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="press flex h-10 items-center justify-center gap-1 rounded-full text-sm font-medium text-primary hover:bg-primary/10"
        >
          {all ? t("less") : t("more", { count: rows.length - SHOWN })}
          <ChevronDown className={cn("size-4 transition-transform", all && "rotate-180")} aria-hidden />
        </button>
      )}

      {isAdmin && !draft && (
        <Button
          type="button"
          variant="secondary"
          className="h-10 w-fit rounded-full px-4"
          onClick={() =>
            setDraft({ key: newCategoryKey(), builtin: false, name: {}, hint: "", icon: "tag", color: "blue", vatBlocked: false, foodCost: false, hidden: false, sort: (rows.at(-1)?.sort ?? 0) + 10, isNew: true })
          }
        >
          <Plus className="size-4" />
          {t("add")}
        </Button>
      )}
      {draft && <Editor draft={draft} onChange={setDraft} onDone={() => setDraft(null)} />}
    </section>
  );
}

function Editor({ draft, onChange, onDone }: { draft: Draft; onChange: (d: Draft) => void; onDone: () => void }) {
  const t = useTranslations("cats");
  const tc = useTranslations("category");
  const locale = useLocale();
  const lang: UiLang = (UI_LANGS as readonly string[]).includes(locale) ? (locale as UiLang) : "en";
  const [busy, setBusy] = useState<"translate" | "save" | null>(null);
  const look = lookOf(draft.key, draft);
  const builtinName = draft.builtin ? tc(draft.key as "other") : "";

  const translate = async () => {
    const text = (draft.name[lang] ?? "").trim();
    if (!text) return toast.error(t("needName"));
    setBusy("translate");
    try {
      const res = await fetch("/api/translate/label", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, from: lang }) });
      const json = (await res.json().catch(() => ({}))) as { names?: Partial<Record<UiLang, string>> };
      if (!res.ok || !json.names) throw new Error();
      onChange({ ...draft, name: { ...draft.name, ...json.names, [lang]: text } });
    } catch {
      toast.error(t("translateFail"));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft.builtin && !(draft.name[lang] ?? "").trim()) return toast.error(t("needName"));
    setBusy("save");
    try {
      // A new name typed in one language only: fill the others first (they can be corrected later)
      let d = draft;
      const typed = (d.name[lang] ?? "").trim();
      if (typed && UI_LANGS.some((l) => l !== lang && !(d.name[l] ?? "").trim())) {
        const res = await fetch("/api/translate/label", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: typed, from: lang }) }).catch(() => null);
        const json = res?.ok ? ((await res.json().catch(() => ({}))) as { names?: Partial<Record<UiLang, string>> }) : {};
        if (json.names) d = { ...d, name: { ...json.names, ...Object.fromEntries(Object.entries(d.name).filter(([, v]) => v?.trim())) } };
      }
      await saveCategory({ ...d, isNew: d.isNew });
      toast.success(t("saved"));
      onDone();
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      className="grid gap-4 rounded-2xl bg-muted/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon category={draft.key} className={cn("size-11", CATEGORY_COLORS[look.color])} />
        <p className="text-sm font-semibold">{draft.isNew ? t("newTitle") : t("editTitle")}</p>
      </div>

      <div className="grid gap-2">
        <span className="text-[11px] text-muted-foreground">{t("name")}</span>
        <div className="flex gap-2">
          <Input
            value={draft.name[lang] ?? ""}
            placeholder={builtinName || t("namePlaceholder")}
            maxLength={40}
            onChange={(e) => onChange({ ...draft, name: { ...draft.name, [lang]: e.target.value } })}
            className="h-10 bg-background"
            autoFocus
          />
          <Button type="button" variant="outline" className="h-10 flex-none rounded-full bg-background px-3" disabled={!!busy} onClick={() => void translate()}>
            {busy === "translate" ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
            <span className="max-sm:sr-only">{t("translate")}</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {UI_LANGS.filter((l) => l !== lang).map((l) => (
            <label key={l} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{l}</span>
              <Input value={draft.name[l] ?? ""} maxLength={40} lang={l} onChange={(e) => onChange({ ...draft, name: { ...draft.name, [l]: e.target.value } })} className="h-9 bg-background text-sm" />
            </label>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{draft.builtin ? t("nameHintBuiltin") : t("nameHint")}</p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-[11px] text-muted-foreground">{t("aiHint")}</span>
        <Input value={draft.hint} maxLength={300} placeholder={t("aiHintPlaceholder")} onChange={(e) => onChange({ ...draft, hint: e.target.value })} className="h-10 bg-background" />
      </label>

      <div className="grid gap-1.5" role="radiogroup" aria-label={t("icon")}>
        <span className="text-[11px] text-muted-foreground">{t("icon")}</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_ICONS) as CategoryIconName[]).map((name) => {
            const Icon = CATEGORY_ICONS[name];
            const on = look.icon === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                onClick={() => onChange({ ...draft, icon: name })}
                className={cn("grid size-9 place-items-center rounded-xl bg-background ring-1 ring-border", on && "ring-2 ring-primary")}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1.5" role="radiogroup" aria-label={t("color")}>
        <span className="text-[11px] text-muted-foreground">{t("color")}</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_COLORS) as CategoryColor[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={look.color === c}
              aria-label={c}
              onClick={() => onChange({ ...draft, color: c })}
              className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", CATEGORY_COLORS[c], look.color === c && "ring-2 ring-foreground")}
            />
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3">
        <Switch checked={draft.foodCost} onCheckedChange={(v) => onChange({ ...draft, foodCost: v })} />
        <span className="grid gap-0.5 text-sm">
          {t("foodCost")}
          <span className="text-[11px] leading-snug text-muted-foreground">{t("foodCostHint")}</span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <Switch checked={draft.vatBlocked} disabled={draft.key === "entertainment"} onCheckedChange={(v) => onChange({ ...draft, vatBlocked: v })} />
        <span className="grid gap-0.5 text-sm">
          {t("noVat")}
          <span className="text-[11px] leading-snug text-muted-foreground">{draft.key === "entertainment" ? t("noVatFixed") : t("noVatHint")}</span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={!!busy} onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" className="rounded-full" disabled={!!busy}>
          {busy === "save" && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
