// What the AI is told about the company's categories (settings → categories), added to the reading instructions:
// its own categories with their key, name and hint, and the built-in ones it hid. Pure, so it can be tested.

export interface PromptCategory {
  key: string;
  builtin: boolean;
  name: Record<string, string | undefined>;
  hint: string;
  hidden: boolean;
}

const nameOf = (c: PromptCategory) => c.name.en?.trim() || c.name.th?.trim() || c.name.ja?.trim() || c.name.ko?.trim() || c.key;

export function categoryPrompt(rows: PromptCategory[]): string {
  const own = rows.filter((c) => !c.builtin && !c.hidden);
  const hidden = rows.filter((c) => c.builtin && c.hidden && c.key !== "other");
  const lines: string[] = [];
  if (own.length) {
    lines.push(
      "- The company also uses these categories; use one of these keys for \"category\" (and items[].category) when it fits better than the built-in ones:",
      ...own.map((c) => `  ${c.key} = ${nameOf(c)}${c.hint.trim() ? ` — ${c.hint.trim().replace(/\s+/g, " ")}` : ""}`),
    );
  }
  if (hidden.length) lines.push(`- Do not use these categories (the company does not use them): ${hidden.map((c) => c.key).join(", ")}.`);
  return lines.join("\n");
}
