/**
 * Confirmly brand mark — official shield mark with verified receipt and checkmark.
 */
export function ConfirmlyMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/confirmly-mark.png"
        alt="Confirmly Mark"
        width={64}
        height={64}
        className="h-full w-full select-none object-contain"
      />
    </span>
  );
}

/**
 * Confirmly full brand logo (shield mark + "Confirmly" wordmark).
 * Supports "light" (dark text on light background) and "dark" (white text on dark background).
 */
export function ConfirmlyLogo({
  className = "",
  tone = "light",
}: {
  className?: string;
  /** "light" = dark text for light backgrounds; "dark" = white text. */
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isDark ? "/brand/confirmly-logo-dark.png" : "/brand/confirmly-logo.png"}
        alt="Confirmly"
        width={172}
        height={51}
        className="h-8 sm:h-9 w-auto max-w-none select-none object-contain"
      />
    </span>
  );
}
