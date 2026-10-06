"use client";

// Last resort when even the page frame breaks: a plain page in the four languages with a reload button. A page left
// open on the previous version (after a deploy) reloads itself once.

import { useEffect } from "react";

const RELOADED = "trl.reloaded-at";
const stale = (e: Error) => e.name === "ChunkLoadError" || /Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(e.message);

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    if (!stale(error)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED) || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f5f5f7", color: "#1d1d1f" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center", lineHeight: 1.6 }}>
          <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>問題が発生しました · เกิดข้อผิดพลาด</p>
          <p style={{ fontSize: 14, color: "#6e6e73", margin: "0 0 20px" }}>문제가 생겼어요 · Something went wrong</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ height: 44, padding: "0 22px", borderRadius: 999, border: 0, background: "#0071e3", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            ↻ 再読み込み · โหลดใหม่ · 다시 불러오기 · Reload
          </button>
          {error.digest && <p style={{ fontSize: 11, color: "#6e6e73", marginTop: 16 }}>#{error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
