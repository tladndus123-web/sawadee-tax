"use client";

// A person's own screen preferences (dashboard cards, saved ledger views …), kept in their sign-in (auth
// user_metadata) so they are the same on every phone and PC. Read once per page load, saved on every change; a save
// that fails keeps the change on screen and says nothing (it is only how the screen looks).

import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

let meta: Promise<Record<string, unknown>> | null = null;
const cache = new Map<string, unknown>();

const load = () =>
  (meta ??= supabaseBrowser()
    .auth.getUser()
    .then(({ data }) => (data.user?.user_metadata ?? {}) as Record<string, unknown>)
    .catch(() => ({}) as Record<string, unknown>));

export function usePref<T>(key: string, read: (v: unknown) => T, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(cache.has(key) ? (cache.get(key) as T) : fallback);
  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    void load().then((m) => {
      const v = read(m[key]);
      cache.set(key, v);
      if (live) setValue(v);
    });
    return () => {
      live = false;
    };
    // `read` is a plain function of the stored value; reading once per key is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = (v: T) => {
    cache.set(key, v);
    setValue(v);
    void supabaseBrowser()
      .auth.updateUser({ data: { [key]: v } })
      .catch(() => undefined);
  };
  return [value, save];
}
