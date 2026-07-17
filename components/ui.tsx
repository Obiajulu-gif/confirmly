import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

/** Small, accessible UI primitives in the Confirmly brand. */

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-900/5 text-ink-700",
    success: "bg-brand-100 text-brand-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    info: "bg-sky-100 text-sky-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function stateTone(
  state: string
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (["PAID", "COMPLETED", "PROCESSED", "DELIVERED", "READ"].includes(state))
    return "success";
  if (
    [
      "PAYMENT_PENDING",
      "PENDING",
      "AWAITING_CONFIRMATION",
      "NEEDS_CLARIFICATION",
      "CREATED",
      "QUEUED",
      "FULFILLING",
    ].includes(state)
  )
    return "warning";
  if (
    ["FAILED", "CANCELLED", "EXPIRED", "REVERSED", "NEEDS_ATTENTION"].includes(
      state
    )
  )
    return "danger";
  if (["HUMAN_REQUIRED", "HUMAN_ACTIVE", "PARTIALLY_PAID", "OVERPAID"].includes(state))
    return "info";
  return "neutral";
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-ink-900/5 bg-surface-raised p-5 shadow-sm ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
    secondary:
      "border border-ink-900/10 bg-surface-raised text-ink-700 hover:border-brand-300 hover:text-brand-700",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    ghost: "text-ink-700 hover:bg-ink-900/5",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
    />
  );
}

export function Input({
  label,
  id,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block text-sm" htmlFor={id}>
      {label ? (
        <span className="mb-1.5 block font-medium text-ink-700">{label}</span>
      ) : null}
      <input
        id={id}
        {...props}
        className={`w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 ${className}`}
      />
    </label>
  );
}

export function Select({
  label,
  id,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block text-sm" htmlFor={id}>
      {label ? (
        <span className="mb-1.5 block font-medium text-ink-700">{label}</span>
      ) : null}
      <select
        id={id}
        {...props}
        className={`w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2 text-ink-900 focus:border-brand-500 ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink-900/15 px-6 py-10 text-center">
      <p className="font-medium text-ink-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-card border border-ink-900/5 bg-surface-raised p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}
