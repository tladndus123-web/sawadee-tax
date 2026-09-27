"use client";

// Open a POS export in the browser: .xlsx (first sheet, via exceljs) or .csv / .txt (comma, semicolon or tab;
// UTF-8, or Thai Windows-874 when UTF-8 gives garbage). Old binary .xls is not supported — save it as .xlsx.

import type { Cell } from "./pos-import";

export class UnsupportedFile extends Error {}

export async function readPosFile(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new UnsupportedFile("xls");
  if (name.endsWith(".xlsx") || file.type.includes("spreadsheetml")) return readXlsx(file);
  return readCsv(file);
}

async function readXlsx(file: File): Promise<Cell[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
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

function cellValue(v: unknown): Cell {
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

async function readCsv(file: File): Promise<Cell[][]> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-874").decode(buf);
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return parseCsv(text, sep);
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
