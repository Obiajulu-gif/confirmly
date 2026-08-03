"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password input with a show/hide toggle and an optional live strength meter.
 * Matches the app's Input styling but adds the affordances users expect on a
 * real sign-in screen.
 */
export function PasswordField({
  name,
  label,
  autoComplete = "current-password",
  placeholder = "Your password",
  required = true,
  minLength,
  showStrength = false,
}: {
  name: string;
  label: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  showStrength?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const strength = scorePassword(value);

  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1.5 block font-medium text-ink-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-ink-900/10 bg-surface-raised px-3 py-2.5 pr-11 text-ink-900 placeholder:text-ink-500/60 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-500 transition hover:text-ink-900"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      {showStrength && value.length > 0 ? (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition ${
                  i < strength.level
                    ? strength.level <= 1
                      ? "bg-red-500"
                      : strength.level === 2
                        ? "bg-amber-500"
                        : "bg-brand-500"
                    : "bg-ink-900/10"
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-500">{strength.label}</p>
        </div>
      ) : null}
    </div>
  );
}

function scorePassword(value: string): { level: number; label: string } {
  if (!value) return { level: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  const level = Math.min(4, score);
  const labels = [
    "Too short",
    "Weak — add length",
    "Fair — mix cases & symbols",
    "Good",
    "Strong",
  ];
  return { level, label: labels[level] ?? "" };
}
