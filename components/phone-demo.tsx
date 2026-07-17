import { Lock, Send, ShieldCheck } from "lucide-react";
import { ConfirmlyMark } from "@/components/logo";

/**
 * Animated phone mockup for the hero — a WhatsApp-style conversation that
 * plays through the Confirmly order flow with staggered CSS animations.
 * Pure CSS/SVG: no images, no client JS, no emoji.
 */

function Bubble({
  side,
  delay,
  children,
  tone = "default",
}: {
  side: "in" | "out";
  delay: number;
  children: React.ReactNode;
  tone?: "default" | "success";
}) {
  return (
    <div
      className={`chat-msg flex ${side === "out" ? "justify-end" : "justify-start"}`}
      style={{ "--d": `${delay}s` } as React.CSSProperties}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11.5px] leading-snug shadow-sm ${
          side === "out"
            ? "rounded-br-sm bg-[#d7fbe4] text-ink-900"
            : tone === "success"
              ? "rounded-bl-sm bg-brand-600 text-white"
              : "rounded-bl-sm bg-white text-ink-900"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function PhoneDemo() {
  return (
    <div
      className="relative mx-auto w-[290px] animate-float sm:w-[310px]"
      style={{ "--tilt": "0deg" } as React.CSSProperties}
      aria-hidden="true"
    >
      {/* glow behind the phone */}
      <div className="orb absolute -inset-10 -z-10 [animation:glow-pulse_6s_ease-in-out_infinite]" />

      {/* frame */}
      <div className="rounded-[2.6rem] border border-white/15 bg-night-800 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-[#0b141a]">
          {/* notch */}
          <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black/90" />

          {/* chat header */}
          <div className="flex items-center gap-2.5 bg-night-700 px-4 pb-3 pt-9">
            <ConfirmlyMark className="h-8 w-8" />
            <div>
              <p className="text-[12.5px] font-semibold text-white">
                Ada Styles
              </p>
              <p className="text-[10px] text-brand-300">
                verified business · online
              </p>
            </div>
          </div>

          {/* conversation */}
          <div
            className="space-y-2 px-3 py-3"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.06), transparent 45%), radial-gradient(circle at 85% 70%, rgba(16,185,129,0.05), transparent 40%)",
            }}
          >
            <Bubble side="out" delay={0.4}>
              I need two black polo shirts, large size, delivered to Yaba
            </Bubble>

            <Bubble side="in" delay={1.3}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-brand-700">
                Order summary
              </span>
              2 × <b>Classic Polo Shirt</b>
              <br />
              Black / Large — ₦24,000
              <br />
              Delivery to Yaba — ₦2,500
              <br />
              <span className="mt-1 block border-t border-ink-900/10 pt-1 font-bold">
                TOTAL ₦26,500
              </span>
            </Bubble>

            <div
              className="chat-msg flex justify-start gap-1.5 pl-1"
              style={{ "--d": "2.2s" } as React.CSSProperties}
            >
              {["confirm", "edit", "human"].map((id, i) => (
                <span
                  key={id}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    i === 0
                      ? "bg-brand-500 text-white"
                      : "border border-white/25 text-white/80"
                  }`}
                >
                  {i === 0 ? "Confirm order" : i === 1 ? "Edit order" : "Talk to seller"}
                </span>
              ))}
            </div>

            <Bubble side="out" delay={3.0}>Confirm order</Bubble>

            <Bubble side="in" delay={3.9}>
              <span className="flex items-center gap-1 font-semibold">
                <Lock className="h-3 w-3" aria-hidden /> Pay securely with
                Monnify:
              </span>
              <span className="font-mono text-[10px] text-brand-700 underline">
                monnify.com/checkout/CFY-8K2M…
              </span>
            </Bubble>

            {/* typing indicator */}
            <div
              className="chat-msg flex justify-start"
              style={{ "--d": "4.8s" } as React.CSSProperties}
            >
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white/90 px-3 py-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-500"
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </div>
            </div>

            <Bubble side="in" delay={6.0} tone="success">
              <b>Payment verified</b>
              <br />
              ₦26,500 confirmed by Monnify — never by screenshot.
              <br />
              <span className="underline decoration-white/50">
                Your receipt: confirmly.app/receipt/…
              </span>
            </Bubble>
          </div>

          {/* input bar */}
          <div className="flex items-center gap-2 border-t border-white/10 bg-night-700 px-3 py-2.5">
            <div className="h-7 flex-1 rounded-full bg-white/10" />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-night-900">
              <Send className="h-3.5 w-3.5" aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {/* floating badges around the phone */}
      <div
        className="anim-fade-up absolute -left-20 top-24 hidden items-center gap-1.5 rounded-xl border border-white/10 bg-night-700/90 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur sm:flex animate-float-slow"
        style={{ "--d": "1.8s", "--tilt": "-3deg" } as React.CSSProperties}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-brand-300" aria-hidden />
        Webhook signature valid
      </div>
      <div
        className="anim-fade-up absolute -right-16 bottom-28 hidden items-center gap-1.5 rounded-xl border border-white/10 bg-night-700/90 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur sm:flex animate-float"
        style={{ "--d": "2.6s", "--tilt": "2deg" } as React.CSSProperties}
      >
        <span className="font-bold text-brand-300">₦</span> Server-verified · PAID
      </div>
    </div>
  );
}
