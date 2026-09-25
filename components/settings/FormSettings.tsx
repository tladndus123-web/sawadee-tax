"use client";

import { ArrowDown, ArrowUp, Info, RotateCcw, Save, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormConfigProvider } from "@/components/invoice/form-config-context";
import { InvoiceView } from "@/components/invoice/InvoiceView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BLOCKS,
  type BlockKey,
  DEFAULT_FORM_CONFIG,
  type FormConfig,
  HIDEABLE_BLOCKS,
  HIDEABLE_FIELDS,
  type HideableField,
  sanitizeFormConfig,
} from "@/lib/form-config";
import { saveFormConfig, useStoredFormConfig } from "@/lib/form-config-store";
import { useMe } from "@/lib/role-store";
import { defaultLabel, type FormMode, LABEL_KEYS, type LabelKey } from "@/lib/form-labels";
import { sampleDoc } from "@/lib/sample";
import { FORM_LANGS } from "@/lib/types";
import { cn } from "@/lib/utils";

const SAMPLE = sampleDoc();
const PLACEHOLDER_LANG = { th: "TH", en: "EN", ja: "JA" } as const;

/** Company form settings: block order / visibility, visible fields, label names, with live preview. */
export function FormSettings() {
  const t = useTranslations();
  const stored = useStoredFormConfig();
  const me = useMe();
  const [draft, setDraft] = useState<FormConfig>(stored);
  const [previewMode, setPreviewMode] = useState<FormMode>("all");
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  // Load the saved settings once they are read from storage
  useEffect(() => setDraft(stored), [stored]);

  const clean = useMemo(() => sanitizeFormConfig(draft, LABEL_KEYS), [draft]);
  const dirty = JSON.stringify(clean) !== JSON.stringify(stored);

  const update = (fn: (d: FormConfig) => FormConfig) => setDraft((d) => fn(structuredClone(d)));

  const move = (i: number, dir: -1 | 1) =>
    update((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.order.length) return d;
      [d.order[i], d.order[j]] = [d.order[j], d.order[i]];
      return d;
    });
  const toggleBlock = (b: BlockKey, on: boolean) =>
    update((d) => ({ ...d, hiddenBlocks: on ? d.hiddenBlocks.filter((x) => x !== b) : [...d.hiddenBlocks, b] }));
  const toggleField = (f: HideableField, on: boolean) =>
    update((d) => ({ ...d, hidden: on ? d.hidden.filter((x) => x !== f) : [...d.hidden, f] }));
  const setLabel = (k: LabelKey, lg: (typeof FORM_LANGS)[number], v: string) =>
    update((d) => ({ ...d, labels: { ...d.labels, [k]: { ...d.labels[k], [lg]: v } } }));
  const resetLabel = (k: LabelKey) =>
    update((d) => {
      delete d.labels[k];
      return d;
    });

  const save = async () => {
    try {
      await saveFormConfig(clean);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.adminOnly"));
    }
  };
  const resetAll = () => {
    setDraft(structuredClone(DEFAULT_FORM_CONFIG));
    toast.info(t("settings.resetDone"));
  };

  const q = query.trim().toLowerCase();
  const labelRows = LABEL_KEYS.filter((k) => {
    if (onlyChanged && !clean.labels[k]) return false;
    if (!q) return true;
    const hay = [t(`labels.${k}`), ...FORM_LANGS.map((lg) => defaultLabel(k, lg)), ...FORM_LANGS.map((lg) => draft.labels[k]?.[lg] ?? "")]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-2xl gap-1">
          <h2 className="text-xl font-semibold">{t("settings.formTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.formDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={resetAll}>
            <RotateCcw className="size-4" />
            {t("settings.resetAll")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!dirty || me.role !== "admin"}>
            <Save className="size-4" />
            {t("settings.save")}
          </Button>
        </div>
      </div>

      <p className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 flex-none" aria-hidden />
        <span>
          {t("settings.adminOnly")}
        </span>
      </p>
      {dirty && (
        <p role="status" className="-mt-3 text-sm font-semibold text-warn">
          {t("settings.unsaved")}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:gap-8">
        {/* Controls */}
        <Tabs defaultValue="layout" className="workspace-panel min-w-0 p-4">
          <TabsList className="segmented-control h-11 w-full">
            <TabsTrigger value="layout">{t("settings.tabs.layout")}</TabsTrigger>
            <TabsTrigger value="fields">{t("settings.tabs.fields")}</TabsTrigger>
            <TabsTrigger value="labels">{t("settings.tabs.labels")}</TabsTrigger>
          </TabsList>

          {/* Block order and visibility */}
          <TabsContent value="layout" className="grid gap-3 pt-3">
            <p className="text-sm text-muted-foreground">{t("settings.blocksHint")}</p>
            <ol className="grid rounded-lg border">
              {clean.order.map((b, i) => {
                const canHide = HIDEABLE_BLOCKS.includes(b);
                const on = !clean.hiddenBlocks.includes(b);
                return (
                  <li key={b} className={cn("flex items-center gap-2 px-2 py-3 transition-colors hover:bg-muted/50 [&+&]:border-t", !on && "text-muted-foreground")}>
                    <span className="mono grid size-6 shrink-0 place-items-center rounded-md bg-background text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{t(`settings.blocks.${b}`)}</span>
                    <Button type="button" variant="ghost" size="icon" className="size-10 sm:size-8" aria-label={`${t(`settings.blocks.${b}`)} ${t("settings.up")}`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 sm:size-8"
                      aria-label={`${t(`settings.blocks.${b}`)} ${t("settings.down")}`}
                      disabled={i === BLOCKS.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Switch checked={on} disabled={!canHide} onCheckedChange={(v) => toggleBlock(b, v)} aria-label={t(`settings.blocks.${b}`)} className="relative after:absolute after:-inset-3 after:content-[]" />
                  </li>
                );
              })}
            </ol>
          </TabsContent>

          {/* Visible fields */}
          <TabsContent value="fields" className="grid gap-4 pt-3">
            <p className="text-sm text-muted-foreground">{t("settings.fieldsHint")}</p>
            {clean.order
              .filter((b) => HIDEABLE_FIELDS[b].length)
              .map((b) => (
                <fieldset key={b} className="grid rounded-lg border">
                  <legend className="px-2 text-xs font-semibold text-muted-foreground">{t(`settings.blocks.${b}`)}</legend>
                  {(HIDEABLE_FIELDS[b] as readonly HideableField[]).map((f) => {
                    const id = `field-${f}`;
                    return (
                      <div key={f} className="flex items-center justify-between gap-3 px-3 py-2 [&+&]:border-t">
                        <label htmlFor={id} className="text-sm">
                          {t(`settings.fields.${f}`)}
                        </label>
                        <Switch id={id} checked={!clean.hidden.includes(f)} onCheckedChange={(v) => toggleField(f, v)} />
                      </div>
                    );
                  })}
                </fieldset>
              ))}
          </TabsContent>

          {/* Label names */}
          <TabsContent value="labels" className="grid gap-3 pt-3">
            <p className="text-sm text-muted-foreground">{t("settings.labelsHint")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-48 flex-1">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("settings.search")} aria-label={t("settings.search")} className="pl-8" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={onlyChanged} onCheckedChange={setOnlyChanged} />
                {t("settings.onlyChanged")}
              </label>
            </div>
            {labelRows.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t("settings.noMatch")}</p>
            ) : (
              <ul className="grid rounded-lg border">
                {labelRows.map((k) => {
                  const changed = !!clean.labels[k];
                  return (
                    <li key={k} className="grid gap-2 px-3 py-3 [&+&]:border-t">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", changed && "text-brand")}>{t(`labels.${k}`)}</span>
                        {changed && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => resetLabel(k)}>
                            <RotateCcw className="size-3.5" />
                            {t("settings.resetOne")}
                          </Button>
                        )}
                      </div>
                      {FORM_LANGS.map((lg) => (
                        <div key={lg} className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">{PLACEHOLDER_LANG[lg]}</span>
                          <Input
                            lang={lg}
                            className="h-8"
                            value={draft.labels[k]?.[lg] ?? ""}
                            placeholder={defaultLabel(k, lg)}
                            aria-label={`${t(`labels.${k}`)} ${PLACEHOLDER_LANG[lg]}`}
                            onChange={(e) => setLabel(k, lg, e.target.value)}
                          />
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {/* Live preview */}
        <section aria-labelledby="preview-title" className="grid min-w-0 gap-4 xl:sticky xl:top-24">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="preview-title" className="font-semibold">
                {t("settings.preview")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("settings.previewHint")}</p>
            </div>
            <ToggleGroup type="single" variant="outline" size="sm" className="segmented-control" value={previewMode} onValueChange={(v) => v && setPreviewMode(v as FormMode)} aria-label={t("app.formLang")}>
              <ToggleGroupItem value="all" className="px-2.5">
                {t("app.all3")}
              </ToggleGroupItem>
              <ToggleGroupItem value="th" lang="th" className="px-2.5">
                ไทย
              </ToggleGroupItem>
              <ToggleGroupItem value="en" className="px-2.5">
                EN
              </ToggleGroupItem>
              <ToggleGroupItem value="ja" lang="ja" className="px-2.5">
                日本語
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-0 rounded-xl xl:max-h-[calc(100dvh-11rem)] xl:overflow-auto">
            <FormConfigProvider config={clean}>
              <InvoiceView doc={SAMPLE} mode={previewMode} />
            </FormConfigProvider>
          </div>
        </section>
      </div>
    </div>
  );
}
