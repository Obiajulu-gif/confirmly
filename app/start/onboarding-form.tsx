"use client";

import { useActionState, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { startOrderAction } from "./actions";
import { INITIAL_ONBOARDING_STATE, type OnboardingState } from "./state";

interface Zone {
  name: string;
  feeLabel: string;
}

const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-white placeholder:text-white/30 transition focus:border-brand-400 focus:bg-white/[0.08]";

export function OnboardingForm({
  zones,
  merchantName,
  storeCode,
}: {
  zones: Zone[];
  merchantName: string;
  storeCode: string;
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    startOrderAction,
    INITIAL_ONBOARDING_STATE
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");

  if (state.ok) {
    return <SuccessPanel state={state} />;
  }

  const canNext = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10;

  return (
    <form action={formAction} className="relative">
      <input type="hidden" name="storeCode" value={storeCode} />
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
        Ordering from {merchantName}
      </p>

      {/* progress */}
      <div className="mb-8 flex items-center gap-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              i <= step ? "bg-brand-400" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {/* step 1 */}
      <fieldset className={step === 0 ? "block" : "hidden"}>
        <legend className="text-2xl font-extrabold tracking-tight text-white">
          First, let&apos;s meet you
        </legend>
        <p className="mt-2 text-sm text-white/55">
          {merchantName} will use this to recognise you on WhatsApp — no more
          repeating your details every order.
        </p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-white/80">
            Your name
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="Chidinma Okafor"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="block text-sm font-medium text-white/80">
            WhatsApp number
            <input
              name="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              placeholder="0803 123 4567 or +234 803 123 4567"
              className={`mt-1.5 ${inputClass}`}
            />
            <span className="mt-1.5 block text-xs font-normal text-white/40">
              We normalise it automatically — 0803 becomes +234 803.
            </span>
          </label>
        </div>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => setStep(1)}
          className="cta-glow mt-8 w-full rounded-2xl bg-brand-500 px-6 py-3.5 font-bold text-night-900 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </fieldset>

      {/* step 2 */}
      <fieldset className={step === 1 ? "block" : "hidden"}>
        <legend className="text-2xl font-extrabold tracking-tight text-white">
          Where do orders go?
        </legend>
        <p className="mt-2 text-sm text-white/55">
          Optional — but if you set it now, the assistant won&apos;t need to
          ask during your order.
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <span className="block text-sm font-medium text-white/80">
              Delivery area
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.name}
                  type="button"
                  onClick={() => setArea(area === zone.name ? "" : zone.name)}
                  aria-pressed={area === zone.name}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    area === zone.name
                      ? "border-brand-400 bg-brand-500/20 text-brand-300"
                      : "border-white/15 text-white/70 hover:border-white/35"
                  }`}
                >
                  {zone.name}
                  <span className="ml-1.5 text-xs font-normal opacity-70">
                    {zone.feeLabel}
                  </span>
                </button>
              ))}
            </div>
            <input type="hidden" name="area" value={area} />
          </div>
          <label className="block text-sm font-medium text-white/80">
            Street address{" "}
            <span className="font-normal text-white/40">(optional)</span>
            <input
              name="address"
              maxLength={200}
              placeholder="12 Herbert Macaulay Way"
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
        </div>

        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30"
          >
            {state.error}
          </p>
        ) : null}

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => setStep(0)}
            className="rounded-2xl border border-white/15 px-6 py-3.5 font-semibold text-white/75 transition hover:border-white/35"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="cta-glow flex-1 rounded-2xl bg-brand-500 px-6 py-3.5 font-bold text-night-900 transition hover:bg-brand-400 disabled:opacity-60"
          >
            {pending ? "Saving" : "Save and open WhatsApp"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function SuccessPanel({ state }: { state: OnboardingState }) {
  return (
    <div className="anim-fade-up text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/20 ring-2 ring-brand-400/50">
        <Check className="h-7 w-7 text-brand-300" aria-hidden />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
        You&apos;re all set
        {state.customerName ? `, ${state.customerName.split(" ")[0]}` : ""}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-white/55">
        {state.merchantName} now knows you
        {state.knownZone ? ` and your ${state.knownZone} delivery details` : ""}.
        Open WhatsApp and just say what you want — in plain words.
      </p>

      {state.waLink ? (
        <a
          href={state.waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-glow mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 py-4 text-lg font-bold text-night-900 transition hover:brightness-110"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          Open WhatsApp and start ordering
        </a>
      ) : (
        <p className="mt-7 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
          The shared WhatsApp number isn&apos;t configured yet — please check
          back shortly.
        </p>
      )}

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-400">
          Try saying
        </p>
        <ul className="mt-3 space-y-2 text-sm text-white/70">
          <li>&quot;2 black polo shirts, large, deliver to Yaba&quot;</li>
          <li>&quot;Abeg give me one hoodie and one tote bag&quot;</li>
          <li>&quot;check payment&quot; · &quot;stores&quot; · &quot;human&quot;</li>
        </ul>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-white/35">
        Sandbox note: this demo runs on Meta&apos;s test number, which can only
        reply to verified test numbers. Payments use the Monnify sandbox — no
        real money moves.
      </p>
    </div>
  );
}
