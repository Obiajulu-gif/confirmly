export function ConfirmlyMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-brand-600" />
      <path
        d="M18 33.5 27.5 43 46 22"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConfirmlyLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ConfirmlyMark className="h-8 w-8" />
      <span className="text-xl font-bold tracking-tight text-ink-900">
        Confirmly
      </span>
    </span>
  );
}
