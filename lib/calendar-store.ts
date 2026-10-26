"use client";

// The tax calendar's own dates and ticks (public.calendar_events, public.calendar_done). Admins only (the database
// refuses anyone else).

import { useEffect, useSyncExternalStore } from "react";
import type { CalEvent } from "./company-calendar";
import { supabaseBrowser } from "./supabase/client";

type Snap = { events: CalEvent[]; done: ReadonlySet<string>; loaded: boolean; dismissed: string[] };
let snap: Snap = { events: [], done: new Set(), loaded: false, dismissed: [] };
const listeners = new Set<() => void>();
let started = false;

async function load() {
  const sb = supabaseBrowser();
  const [ev, dn, st] = await Promise.all([sb.from("calendar_events").select("id, title, date, repeat, remind_days, note, amount, source").order("date"), sb.from("calendar_done").select("key"), sb.from("company_settings").select("calendar").eq("id", 1).maybeSingle()]);
  if (ev.error || dn.error) return;
  snap = {
    events: (ev.data ?? []).map((r) => ({ id: r.id, title: r.title, date: r.date, repeat: r.repeat, remindDays: Number(r.remind_days) || 0, note: r.note ?? "", amount: r.amount === null ? null : Number(r.amount), source: r.source })),
    done: new Set((dn.data ?? []).map((r) => r.key as string)),
    loaded: true,
    dismissed: Array.isArray((st.data?.calendar as { dismissed?: unknown } | null)?.dismissed) ? ((st.data!.calendar as { dismissed: string[] }).dismissed.filter((x) => typeof x === "string")) : [],
  };
  listeners.forEach((l) => l());
}

export function useCalendar(): Snap {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => snap,
  );
  useEffect(() => {
    if (!started) {
      started = true;
      void load();
    }
  }, []);
  return s;
}

export async function saveEvent(e: Omit<CalEvent, "id"> & { id?: string }) {
  const row = { title: e.title.trim(), date: e.date, repeat: e.repeat, remind_days: e.remindDays, note: e.note.trim(), ...(e.amount !== undefined ? { amount: e.amount } : {}), ...(e.source ? { source: e.source } : {}) };
  const sb = supabaseBrowser();
  const { error } = e.id ? await sb.from("calendar_events").update(row).eq("id", e.id) : await sb.from("calendar_events").insert(row);
  if (error) throw error;
  await load();
}

export async function removeEvent(id: string) {
  const { error } = await supabaseBrowser().from("calendar_events").delete().eq("id", id);
  if (error) throw error;
  await load();
}

/** Tick an item off, or untick it */
export async function setDone(key: string, on: boolean) {
  const sb = supabaseBrowser();
  const { error } = on ? await sb.from("calendar_done").upsert({ key }, { onConflict: "key" }) : await sb.from("calendar_done").delete().eq("key", key);
  if (error) throw error;
  await load();
}

/** "Not a repeating payment": the suggestion is not offered again (admins) */
export async function dismissRecurring(key: string) {
  const dismissed = [...new Set([...snap.dismissed, key])].slice(-200);
  const { error } = await supabaseBrowser().from("company_settings").update({ calendar: { dismissed } }).eq("id", 1);
  if (error) throw error;
  snap = { ...snap, dismissed };
  listeners.forEach((l) => l());
}
