// Login background: receipts drift up a faint ledger sheet; on the way each is scanned by a blue line
// and gets a check (what the app does with a photo). Pure CSS (app/globals.css, "Login backdrop"),
// transform/opacity only so it stays cheap on phones; still pictures when reduced motion is on.
import type { CSSProperties } from "react";

type Receipt = {
  /** Centre, in % of the screen width */
  x: number;
  /** Width in px (height follows the rows) */
  w: number;
  /** Tilt in degrees */
  tilt: number;
  /** Seconds for one trip bottom → top */
  dur: number;
  /** Negative: start partway through, so the screen isn't empty on load */
  delay: number;
  /** Depth: fainter = further away */
  fade: number;
  /** Where it rests (top, %) when motion is off */
  rest: number;
  /** Item row lengths (% of the line) */
  rows: number[];
  total: string;
};

const RECEIPTS: Receipt[] = [
  { x: 9, w: 148, tilt: -6, dur: 34, delay: -4, fade: 0.9, rest: 10, rows: [72, 54, 64], total: "฿1,284.00" },
  { x: 25, w: 118, tilt: 5, dur: 42, delay: -24, fade: 0.55, rest: 60, rows: [60, 80], total: "฿356.50" },
  { x: 41, w: 108, tilt: 3, dur: 48, delay: -40, fade: 0.4, rest: 84, rows: [66, 48, 70], total: "฿7,490.00" },
  { x: 58, w: 124, tilt: -7, dur: 39, delay: -9, fade: 0.5, rest: 4, rows: [58, 76], total: "฿2,140.75" },
  { x: 75, w: 142, tilt: -4, dur: 36, delay: -15, fade: 0.85, rest: 22, rows: [70, 50, 62, 44], total: "฿4,815.00" },
  { x: 91, w: 120, tilt: 7, dur: 44, delay: -31, fade: 0.6, rest: 66, rows: [64, 52], total: "฿92.00" },
  { x: 2, w: 112, tilt: 4, dur: 46, delay: -27, fade: 0.5, rest: 52, rows: [56, 74], total: "฿640.00" },
  { x: 97, w: 136, tilt: -3, dur: 33, delay: -2, fade: 0.75, rest: 36, rows: [68, 46, 58], total: "฿12,300.00" },
];

export function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden>
      {RECEIPTS.map((r, i) => (
        <div
          key={i}
          className="lb-receipt"
          style={
            {
              "--x": `${r.x}%`,
              "--w": `${r.w}px`,
              "--tilt": `${r.tilt}deg`,
              "--dur": `${r.dur}s`,
              "--delay": `${r.delay}s`,
              "--fade": r.fade,
              "--rest": `${r.rest}%`,
            } as CSSProperties
          }
        >
          <div className="lb-paper">
            <span className="lb-bar lb-bar-head" />
            <span className="lb-bar lb-bar-sub" />
            <span className="lb-rule" />
            {r.rows.map((len, j) => (
              <span key={j} className="lb-row">
                <span className="lb-bar" style={{ width: `${len * 0.62}%` }} />
                <span className="lb-bar lb-bar-amt" />
              </span>
            ))}
            <span className="lb-rule" />
            <span className="lb-row lb-total">
              <span className="lb-bar lb-bar-label" />
              <span className="num">{r.total}</span>
            </span>
            <span className="lb-scan" />
          </div>
          <span className="lb-teeth" />
          <span className="lb-check">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M4.2 8.4l2.5 2.5 5-5.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      ))}
    </div>
  );
}
