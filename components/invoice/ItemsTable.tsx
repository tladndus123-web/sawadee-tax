"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { HideableField } from "@/lib/form-config";
import type { FormMode, LabelKey } from "@/lib/form-labels";
import { fmt } from "@/lib/money";
import { emptyTri } from "@/lib/normalize";
import type { Item, LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./fields";
import { useFormLabels } from "./form-config-context";
import { NumIn, TextIn } from "./form-inputs";
import { TriInput } from "./TriInput";
import { TriText } from "./TriText";

type Col = { k: LabelKey; num?: boolean; cls?: string; hide?: HideableField };
const COLS: Col[] = [
  { k: "no", cls: "w-12" },
  { k: "code", hide: "colCode" },
  { k: "desc" },
  { k: "wh", hide: "colWh" },
  { k: "qty", num: true },
  { k: "unit", hide: "colUnit" },
  { k: "price", num: true, hide: "colPrice" },
  { k: "amount", num: true },
];

function Head({ mode, edit, extra, cols = COLS }: { mode: FormMode; edit?: boolean; extra?: boolean; cols?: Col[] }) {
  return (
    <thead>
      <tr className="bg-band">
        {cols.map(({ k, num, cls }) => (
          <th key={k} scope="col" className={cn("border-b border-rule px-2.5 py-2 text-left align-bottom font-semibold", cls)}>
            <FieldLabel k={k} mode={mode} edit={edit} className={cn("text-foreground/80", num && "text-right")} />
          </th>
        ))}
        {extra && <th className="w-10 border-b border-rule" />}
      </tr>
    </thead>
  );
}

const TD = "border-b border-rule-soft px-2.5 py-2 align-top";

/** Items table, view mode. Only this table may scroll sideways on phones. */
export function ItemsTableView({
  items,
  mode,
  unsure,
  onUnsure,
}: {
  items: Item[];
  mode: FormMode;
  unsure: (path: string) => boolean;
  onUnsure?: (path: string) => void;
}) {
  const { show } = useFormLabels();
  const cols = COLS.filter((c) => !c.hide || show(c.hide));
  const cell = (k: LabelKey, it: Item, i: number) => {
    switch (k) {
      case "no":
        return <td key={k} className={cn(TD, "mono")}>{i + 1}</td>;
      case "code":
        return <td key={k} className={cn(TD, "mono")}>{it.code}</td>;
      case "desc":
        return (
          <td key={k} className={cn(TD, "min-w-56")}>
            <TriText value={it.desc} mode={mode} unsure={unsure(`items.${i}.desc`)} onUnsure={onUnsure && (() => onUnsure(`items.${i}.desc`))} />
          </td>
        );
      case "wh":
        return <td key={k} className={cn(TD, "mono")}>{it.wh}</td>;
      case "qty":
        return <td key={k} className={cn(TD, "num")}>{fmt(it.qty)}</td>;
      case "unit":
        return (
          <td key={k} className={TD}>
            <TriText value={it.unit} mode={mode} />
          </td>
        );
      case "price":
        return <td key={k} className={cn(TD, "num")}>{it.price ? fmt(it.price) : ""}</td>;
      default:
        return <td key={k} className={cn(TD, "num")}>{fmt(it.amount)}</td>;
    }
  };
  return (
    <div className="overflow-x-auto border border-rule">
      <table className={cn("w-full border-collapse text-sm", cols.length > 6 ? "min-w-[680px]" : "min-w-[480px]")}>
        <Head mode={mode} cols={cols} />
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>{cols.map((c) => cell(c.k, it, i))}</tr>
          ))}
          {/* Empty space like the printed form */}
          <tr aria-hidden>
            <td colSpan={cols.length} className="h-16" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Items table, edit mode (react-hook-form field array) */
export function ItemsTableEdit({ mode }: { mode: FormMode }) {
  const t = useTranslations();
  const { control } = useFormContext<LedgerDoc>();
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto border border-rule">
        <table className="w-full min-w-[1060px] border-collapse text-sm">
          <Head mode={mode} edit extra />
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id}>
                <td className={cn(TD, "mono pt-3")}>{i + 1}</td>
                <td className={cn(TD, "min-w-32")}>
                  <TextIn name={`items.${i}.code`} label={t("labels.code")} mono />
                </td>
                <td className={cn(TD, "min-w-60")}>
                  <TriInput name={`items.${i}.desc`} label={t("labels.desc")} />
                </td>
                <td className={cn(TD, "min-w-20")}>
                  <TextIn name={`items.${i}.wh`} label={t("labels.wh")} mono />
                </td>
                <td className={cn(TD, "min-w-24")}>
                  <NumIn name={`items.${i}.qty`} label={t("labels.qty")} />
                </td>
                <td className={cn(TD, "min-w-36")}>
                  <TriInput name={`items.${i}.unit`} label={t("labels.unit")} />
                </td>
                <td className={cn(TD, "min-w-32")}>
                  <NumIn name={`items.${i}.price`} label={t("labels.price")} />
                </td>
                <td className={cn(TD, "min-w-36")}>
                  <NumIn name={`items.${i}.amount`} label={t("labels.amount")} />
                </td>
                <td className={cn(TD, "w-10")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-bad"
                    aria-label={`${t("app.del")} ${i + 1}`}
                    onClick={() => remove(i)}
                  >
                    <X className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => append({ code: "", desc: emptyTri(), wh: "", qty: 1, unit: emptyTri(), price: 0, amount: 0 })}
      >
        <Plus className="size-4" />
        {t("app.addItem").replace(/^\+\s*/, "")}
      </Button>
    </div>
  );
}
