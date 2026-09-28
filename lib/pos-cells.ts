// Cells of a POS export, shared by the browser reader (lib/pos-read) and the server one (lib/pos-read-server):
// an ExcelJS worksheet to rows, and a CSV text to rows.

import type { Cell } from "./pos-import";

export function cellValue(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ("result" in o) return cellValue(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
  }
  return String(v);
}

type SheetLike = { eachRow: (opts: { includeEmpty: boolean }, fn: (row: { eachCell: (opts: { includeEmpty: boolean }, fn: (cell: { value: unknown }, col: number) => void) => void }) => void) => void };

/** Every row of the first worksheet, empty cells kept in place */
export function rowsOfSheet(ws: SheetLike | undefined): Cell[][] {
  if (!ws) return [];
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const out: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      out[col - 1] = cellValue(cell.value);
    });
    rows.push(out);
  });
  return rows;
}

/** A CSV text (bytes already decoded): comma, semicolon or tab, whichever the first line uses most */
export function csvRows(text: string): Cell[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return parseCsv(clean, sep);
}

/** RFC 4180-style: quoted fields may hold separators, doubled quotes and line breaks */
export function parseCsv(text: string, sep = ","): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
