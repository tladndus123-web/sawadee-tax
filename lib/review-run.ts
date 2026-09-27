"use client";

// The current "check one by one" run: documents confirmed or skipped since it started. Kept in memory for the
// tab (moving between documents is client-side navigation), cleared when a new run starts.

const done = new Set<string>();

export const reviewRun = {
  done: done as ReadonlySet<string>,
  start: () => done.clear(),
  mark: (id: string) => void done.add(id),
};
