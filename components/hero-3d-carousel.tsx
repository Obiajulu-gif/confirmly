"use client";

import { useEffect, useMemo, useRef } from "react";

/* ---------------------------------------------------------------------------
   Hero 3D carousel — a depth "tunnel fan".

   Cards ride a conveyor that sits far behind the screen at the centre and
   comes right up against the camera at both edges, so the row reads as a
   funnel opening toward the viewer. Cards travel right → centre → left, which
   means each one enters large, shrinks into the distance, then swells again
   on its way out.

   Pure CSS 3D on real DOM nodes — no WebGL, no canvas textures — so the
   screenshots stay sharp and the copy stays selectable.

   Motion comes from three sources that all feed one `offset`, measured in
   slots: page scroll (scrubbed), a slow ambient drift, and pointer drag.
--------------------------------------------------------------------------- */

type HeroCard = {
  id: string;
  image: string;
  title: string;
  /** object-position Y, to frame the part of the screenshot that matters. */
  focus: string;
};

/**
 * Order is the story the visitor reads as cards stream in from the right.
 * The last entry is the one sitting large in the foreground on first paint.
 */
const HERO_CARDS: HeroCard[] = [
  {
    id: "chat",
    image: "/hero/chat.jpg",
    title: "Customers order without leaving WhatsApp",
    focus: "42%",
  },
  {
    id: "shop",
    image: "/hero/dashboard_whatsapp.jpg",
    title: "Find a store and check out inside the chat",
    focus: "38%",
  },
  {
    id: "stores",
    image: "/hero/stores.jpg",
    title: "One number, every branch",
    focus: "46%",
  },
  {
    id: "catalogue",
    image: "/hero/catalogue.jpg",
    title: "Your catalogue, priced automatically",
    focus: "40%",
  },
  {
    id: "product",
    image: "/hero/product_detail.jpg",
    title: "Variants and quantities, no guesswork",
    focus: "40%",
  },
  {
    id: "dashboard",
    image: "/hero/merchant_dashboard.jpeg",
    title: "One dashboard, verified payment data only",
    focus: "44%",
  },
  {
    id: "receipt",
    image: "/hero/receipt.jpg",
    title: "A verified receipt the moment they pay",
    focus: "40%",
  },
];

/* --------------------------------------------------------------- tuning ---
   `cardW` is a fraction of the stage width. `slots` is how many positions sit
   on the conveyor — kept at a multiple of HERO_CARDS.length so a repeated
   screenshot is always as far from its twin as the loop allows.
   `s0`/`s1` are the scale of the deepest (centre) card and of the outermost
   one; `es` controls how back-loaded the growth between them is.
--------------------------------------------------------------------------- */
type Tuning = {
  slots: number;
  cardW: number;
  cardWMax: number;
  s0: number;
  s1: number;
  es: number;
  rot: number;
  gap: number;
  perspective: number;
};

const TIERS: Array<{ upTo: number; t: Tuning }> = [
  { upTo: 520, t: { slots: 7, cardW: 0.26, cardWMax: 124, s0: 0.58, s1: 1.9, es: 1.8, rot: 34, gap: 0.86, perspective: 1100 } },
  { upTo: 820, t: { slots: 7, cardW: 0.18, cardWMax: 142, s0: 0.5, s1: 2.2, es: 1.9, rot: 38, gap: 0.88, perspective: 1250 } },
  { upTo: 1180, t: { slots: 14, cardW: 0.125, cardWMax: 148, s0: 0.34, s1: 2.9, es: 2.1, rot: 42, gap: 0.9, perspective: 1400 } },
  { upTo: Infinity, t: { slots: 14, cardW: 0.108, cardWMax: 172, s0: 0.3, s1: 3.3, es: 2.2, rot: 44, gap: 0.92, perspective: 1500 } },
];

const MAX_SLOTS = 14;
/** Phone screenshots are 9:20; a hair of crop trims the status bar. */
const CARD_RATIO = 2.15;
/** Slots advanced per viewport-height of page scroll. */
const SCROLL_SPAN = 3.0;
/** Slots per second of ambient drift. */
const DRIFT = 0.13;
/** n at which a card starts fading out — it is off-screen by then. */
const FADE_FROM = 0.93;
/** n range over which a card's title fades in. */
const UI_FROM = 0.52;
const UI_TO = 0.8;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 600;

const tuningFor = (w: number) => (TIERS.find((tier) => w <= tier.upTo) ?? TIERS[TIERS.length - 1]!).t;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function Hero3DCarousel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const titleRefs = useRef<Array<HTMLDivElement | null>>([]);

  const slots = useMemo(
    () => Array.from({ length: MAX_SLOTS }, (_, i) => ({ i, card: HERO_CARDS[i % HERO_CARDS.length]! })),
    []
  );

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let tuning = tuningFor(window.innerWidth);
    let cardW = 0;
    let cardH = 0;
    let uMax = tuning.slots / 2;

    const SAMPLE = 0.01;
    let table: number[] = [];

    const scaleAt = (u: number) => {
      const n = Math.min(1, u / uMax);
      return tuning.s0 * Math.pow(tuning.s1 / tuning.s0, Math.pow(n, tuning.es));
    };
    const rotAt = (u: number) => tuning.rot * Math.min(1, u / uMax);
    /** How wide a card actually reads on screen, foreshortening included. */
    const projectedAt = (u: number) => scaleAt(u) * Math.cos((rotAt(u) * Math.PI) / 180);

    const buildTable = () => {
      table = [0];
      for (let u = SAMPLE; u <= uMax + SAMPLE; u += SAMPLE) {
        table.push(table[table.length - 1]! + ((projectedAt(u - SAMPLE) + projectedAt(u)) / 2) * SAMPLE);
      }
    };
    /** Cumulative projected width out to `u` — keeps on-screen packing even. */
    const spread = (u: number) => {
      const i = u / SAMPLE;
      const lo = Math.floor(i);
      if (lo >= table.length - 1) return table[table.length - 1]!;
      return table[lo]! + (table[lo + 1]! - table[lo]!) * (i - lo);
    };

    const measure = () => {
      const w = stage.clientWidth || window.innerWidth;
      tuning = tuningFor(w);
      uMax = tuning.slots / 2;
      cardW = Math.min(tuning.cardWMax, w * tuning.cardW);
      cardH = cardW * CARD_RATIO;
      buildTable();

      // Tall enough for the foreground cards to dominate, short enough that
      // the very outermost still run off the top and bottom on purpose.
      const height = clamp(cardH * scaleAt(uMax * 0.86), MIN_HEIGHT, MAX_HEIGHT);

      stage.style.height = `${Math.round(height)}px`;
      stage.style.perspective = `${tuning.perspective}px`;

      for (let i = 0; i < MAX_SLOTS; i++) {
        const el = slotRefs.current[i];
        if (!el) continue;
        el.style.display = i < tuning.slots ? "" : "none";
        el.style.width = `${cardW}px`;
        el.style.height = `${cardH}px`;
        el.style.marginLeft = `${-cardW / 2}px`;
        el.style.marginTop = `${-cardH / 2}px`;
        el.style.fontSize = `${cardW / 13}px`;
        el.style.borderRadius = `${cardW / 8}px`;
      }
    };

    let offset = 0; // what is drawn
    let target = 0; // where it is heading
    let drift = 0;
    let dragOffset = 0;
    let scrollOffset = 0;
    let tiltX = 0;
    let tiltY = 0;
    let tiltTargetX = 0;
    let tiltTargetY = 0;

    const layout = () => {
      const n = tuning.slots;
      for (let i = 0; i < n; i++) {
        const el = slotRefs.current[i];
        const title = titleRefs.current[i];
        if (!el) continue;

        let t = i - offset;
        t = (((t % n) + n * 1.5) % n) - n / 2; // wrap into [-uMax, uMax)
        const u = Math.abs(t);
        const sign = t < 0 ? -1 : 1;
        const norm = Math.min(1, u / uMax);

        const s = scaleAt(u);
        const z = tuning.perspective - tuning.perspective / s;
        const x = (sign * tuning.gap * cardW * spread(u)) / s;
        const rotY = -sign * rotAt(u);

        el.style.transform = `translate3d(${x.toFixed(2)}px, 0, ${z.toFixed(2)}px) rotateY(${rotY.toFixed(2)}deg)`;
        el.style.opacity = (1 - smoothstep(FADE_FROM, 1, norm)).toFixed(3);
        el.style.zIndex = String(Math.round(4000 + z));
        if (title) title.style.opacity = smoothstep(UI_FROM, UI_TO, norm).toFixed(3);
      }
      track.style.transform = `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
    };

    const readScroll = () => {
      scrollOffset = (window.scrollY / Math.max(1, window.innerHeight)) * SCROLL_SPAN;
    };

    /* ------------------------------------------------------------ drag --- */
    let dragging = false;
    let lastX = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      stage.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        const rect = stage.getBoundingClientRect();
        tiltTargetY = (((e.clientX - rect.left) / rect.width) * 2 - 1) * 1.6;
        tiltTargetX = -((((e.clientY - rect.top) / rect.height) * 2 - 1) * 1.1);
      }
      if (!dragging) return;
      dragOffset -= (e.clientX - lastX) / (cardW * 1.6);
      lastX = e.clientX;
    };
    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      stage.releasePointerCapture?.(e.pointerId);
    };
    const onPointerLeave = () => {
      tiltTargetX = 0;
      tiltTargetY = 0;
    };

    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    stage.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", readScroll, { passive: true });

    /* ------------------------------------------------------------ loop --- */
    let raf = 0;
    let last = performance.now();
    let onScreen = true;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!reduced && !dragging) drift += dt * DRIFT;
      target = drift + scrollOffset + dragOffset;

      offset += (target - offset) * (1 - Math.pow(0.001, dt));
      tiltX += (tiltTargetX - tiltX) * (1 - Math.pow(0.004, dt));
      tiltY += (tiltTargetY - tiltY) * (1 - Math.pow(0.004, dt));

      layout();
      raf = onScreen ? requestAnimationFrame(frame) : 0;
    };

    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = !!entry?.isIntersecting;
        if (onScreen && !raf) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      },
      { rootMargin: "160px" }
    );
    visibility.observe(stage);

    const resize = new ResizeObserver(() => {
      measure();
      layout();
    });
    resize.observe(stage);

    measure();
    readScroll();
    offset = scrollOffset;
    layout();
    raf = requestAnimationFrame(frame);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      visibility.disconnect();
      resize.disconnect();
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      stage.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", readScroll);
    };
  }, []);

  return (
    <div className="relative left-1/2 -ml-[50vw] w-screen select-none">
      {/* brand glow sitting behind the waist of the fan */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 48% at 50% 50%, rgba(23,193,154,0.18), rgba(23,193,154,0) 72%)",
        }}
      />
      <div
        ref={stageRef}
        role="group"
        aria-label="Confirmly in use: ordering on WhatsApp, paying, and receiving a verified receipt"
        className="relative h-[360px] w-full cursor-grab touch-pan-y overflow-hidden active:cursor-grabbing"
        style={{ perspective: "1500px", perspectiveOrigin: "50% 50%" }}
      >
        <div ref={trackRef} className="absolute inset-0 [transform-style:preserve-3d]">
          {slots.map(({ i, card }) => (
            <div
              key={i}
              ref={(el) => {
                slotRefs.current[i] = el;
              }}
              className="absolute left-1/2 top-1/2 overflow-hidden bg-[#0b1220] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)] [backface-visibility:hidden] [will-change:transform,opacity]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.image}
                alt=""
                draggable={false}
                loading={i < 7 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: `center ${card.focus}` }}
              />

              <div aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/12" />

              <div
                ref={(el) => {
                  titleRefs.current[i] = el;
                }}
                className="absolute inset-x-0 bottom-0 flex items-end p-[0.85em] pt-[2.4em]"
                style={{
                  background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 52%, rgba(0,0,0,0.9) 100%)",
                }}
              >
                <p className="line-clamp-3 text-[1em] font-bold leading-[1.2] tracking-[-0.01em] text-white">
                  {card.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
