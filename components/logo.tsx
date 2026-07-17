/**
 * Confirmly brand mark — a chat bubble carrying a receipt with a bold
 * confirmation check (SVG recreation of the brand logo).
 */
export function ConfirmlyMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none">
      {/* chat bubble with tail */}
      <path
        d="M20 4h24c8.837 0 16 7.163 16 16v16c0 8.837-7.163 16-16 16H24l-11 9c-2.05 1.677-5-.03-5-2.68V20C8 11.163 11.163 4 20 4Z"
        fill="#10b981"
      />
      <path
        d="M20 4h24c8.837 0 16 7.163 16 16v16c0 8.837-7.163 16-16 16H24l-11 9c-2.05 1.677-5-.03-5-2.68V20C8 11.163 11.163 4 20 4Z"
        fill="url(#cf-mark-sheen)"
      />
      {/* receipt with torn top edge */}
      <path
        d="M22 14l3.4-3 3.4 3 3.4-3 3.4 3 3.4-3 3.4 3V44a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V14Z"
        fill="#ffffff"
      />
      <rect x="27" y="20" width="14" height="2.6" rx="1.3" fill="#a7f3d0" />
      <rect x="27" y="26" width="10" height="2.6" rx="1.3" fill="#d1fae5" />
      {/* confirmation check */}
      <path
        d="M26 35.5l6.5 6.5L45 28"
        stroke="#059669"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="cf-mark-sheen" x1="8" y1="4" x2="60" y2="61" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" stopOpacity=".55" />
          <stop offset="1" stopColor="#047857" stopOpacity=".35" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ConfirmlyLogo({
  className = "",
  tone = "light",
}: {
  className?: string;
  /** "light" = dark text for light backgrounds; "dark" = white text. */
  tone?: "light" | "dark";
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ConfirmlyMark className="h-9 w-9 drop-shadow-sm" />
      <span
        className={`text-[1.35rem] font-extrabold tracking-tight ${
          tone === "dark" ? "text-white" : "text-ink-900"
        }`}
      >
        Conf<span className="relative">i<span className="absolute -top-[0.18em] left-1/2 h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-brand-500" aria-hidden="true" /></span>rmly
      </span>
    </span>
  );
}
