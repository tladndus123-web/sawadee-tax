// App logo: Lucide "receipt-text" + "sparkle" glyphs (ISC license) on the Apple Intelligence spectrum.
// app/icon.svg is the same drawing for the browser tab; keep the two in sync.

export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="trl-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0894ff" />
          <stop offset="0.38" stopColor="#c959dd" />
          <stop offset="0.7" stopColor="#ff2e54" />
          <stop offset="1" stopColor="#ff9004" />
        </linearGradient>
        <radialGradient id="trl-mark-shine" cx="0.25" cy="0.15" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#trl-mark-bg)" />
      <rect width="64" height="64" rx="18" fill="url(#trl-mark-shine)" />
      <g transform="translate(13 14) scale(1.5)" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 16H8M14 8H8M16 12H8" />
        <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
      </g>
      <path
        transform="translate(38 5) scale(0.9)"
        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
        fill="#fff"
        stroke="#e0487f"
        strokeWidth="2.4"
        paintOrder="stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
