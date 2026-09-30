"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Star } from "lucide-react";
import type { PublicStore } from "@/lib/stores";
import { StoreArtwork } from "@/components/store-artwork";

/* ---------------------------------------------------------------------------
   Store showcase — a curved gallery wall.

   Wide cards sit on the inside of a cylinder around the viewer: the focused
   store faces you flat, its neighbours bend in toward the edges of the screen,
   and a perspective grid runs away underneath. Pure CSS 3D on real DOM nodes,
   driven by one `offset` (in cards) that autoplay, arrows, keys and drag feed.
--------------------------------------------------------------------------- */

/** Fewer stores than this and the wall is padded by repeating them. */
const MIN_SLOTS = 7;
const AUTOPLAY_MS = 4800;
/** Card aspect (w / h) — landscape, like a site screenshot. */
const CARD_RATIO = 1.6;
/** Cylinder radius and camera distance, as multiples of the card width. */
const RADIUS = 1.45;
const CAMERA = 0.55;
const GAP = 0.05;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function StoreShowcase({ stores }: { stores: PublicStore[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const goRef = useRef<(delta: number) => void>(() => {});
  const [active, setActive] = useState(0);

  const slots = useMemo(() => {
    if (stores.length === 0) return [];
    const count = Math.max(MIN_SLOTS, stores.length);
    return Array.from({ length: count }, (_, i) => stores[i % stores.length]!);
  }, [stores]);

  useEffect(() => {
    const stage = stageRef.current;
    const n = slots.length;
    if (!stage || n === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cardW = 0;
    let radius = 0;
    let stepRad = 0;
    let offset = 0; // drawn
    let target = 0; // heading to
    let lastActive = -1;
    let lastInteraction = performance.now();

    const measure = () => {
      const w = stage.clientWidth || window.innerWidth;
      cardW = w < 640 ? w * 0.74 : clamp(w * 0.5, 420, 700);
      const cardH = cardW / CARD_RATIO;
      radius = cardW * RADIUS;
      stepRad = (cardW * (1 + GAP)) / radius;
      stage.style.height = `${Math.round(cardH * 1.55)}px`;
      stage.style.perspective = `${Math.round(cardW * 1.9)}px`;
      for (const el of slotRefs.current) {
        if (!el) continue;
        el.style.width = `${cardW}px`;
        el.style.height = `${cardH}px`;
        el.style.marginLeft = `${-cardW / 2}px`;
        el.style.marginTop = `${-cardH / 2 - cardH * 0.08}px`;
        el.style.fontSize = `${clamp(cardW / 30, 11, 20)}px`;
      }
    };

    const layout = () => {
      const camZ = radius - cardW * CAMERA;
      for (let i = 0; i < n; i++) {
        const el = slotRefs.current[i];
        if (!el) continue;
        let t = i - offset;
        t = (((t % n) + n * 1.5) % n) - n / 2; // wrap into [-n/2, n/2)
        const theta = t * stepRad;
        const deg = (theta * 180) / Math.PI;
        const a = Math.abs(deg);
        el.style.transform = `translateZ(${camZ.toFixed(1)}px) rotateY(${(-deg).toFixed(2)}deg) translateZ(${(-radius).toFixed(1)}px)`;
        el.style.opacity = a > 88 ? "0" : (1 - clamp((a - 62) / 26, 0, 1)).toFixed(3);
        el.style.visibility = a > 88 ? "hidden" : "visible";
        el.style.zIndex = String(1000 - Math.round(a));
        el.style.setProperty("--dim", clamp(a / 60, 0, 1).toFixed(3));
        el.toggleAttribute("inert", Math.abs(t) > 0.5);
      }
      const nearest = ((Math.round(offset) % n) + n) % n;
      if (nearest !== lastActive) {
        lastActive = nearest;
        setActive(nearest);
      }
    };

    goRef.current = (delta: number) => {
      target = Math.round(target) + delta;
      lastInteraction = performance.now();
    };

    /* ------------------------------------------------------------ drag --- */
    let dragging = false;
    let moved = 0;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      moved = 0;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      if (moved > 6) stage.setPointerCapture?.(e.pointerId);
      target -= dx / (cardW * 0.9);
      offset = target;
      lastInteraction = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      stage.releasePointerCapture?.(e.pointerId);
      target = Math.round(target);
    };
    // A drag should not also count as a click on the card underneath.
    const onClickCapture = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("click", onClickCapture, true);

    /* ------------------------------------------------------------ loop --- */
    let raf = 0;
    let last = performance.now();
    let onScreen = false;
    let hovering = false;
    const onEnter = () => (hovering = true);
    const onLeave = () => (hovering = false);
    stage.addEventListener("pointerenter", onEnter);
    stage.addEventListener("pointerleave", onLeave);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (
        !reduced &&
        !dragging &&
        !hovering &&
        document.visibilityState === "visible" &&
        now - lastInteraction > AUTOPLAY_MS
      ) {
        target = Math.round(target) + 1;
        lastInteraction = now;
      }
      if (!dragging) offset += (target - offset) * (1 - Math.pow(reduced ? 1e-9 : 0.0015, dt));
      layout();
      raf = onScreen ? requestAnimationFrame(frame) : 0;
    };

    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = !!entry?.isIntersecting;
        if (onScreen && !raf) {
          last = performance.now();
          lastInteraction = last;
          raf = requestAnimationFrame(frame);
        }
      },
      { rootMargin: "120px" }
    );
    visibility.observe(stage);

    const resize = new ResizeObserver(() => {
      measure();
      layout();
    });
    resize.observe(stage);
    measure();
    layout();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      visibility.disconnect();
      resize.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("click", onClickCapture, true);
      stage.removeEventListener("pointerenter", onEnter);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, [slots]);

  if (stores.length === 0) return null;
  const current = slots[active] ?? slots[0]!;
  const realIndex = active % stores.length;

  return (
    <section
      id="stores"
      aria-roledescription="carousel"
      aria-label="Stores selling on Confirmly"
      className="relative overflow-hidden border-t border-gray-200 bg-[#f8faf9] py-20 text-[#111827] sm:py-24"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") goRef.current(1);
        if (e.key === "ArrowLeft") goRef.current(-1);
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 light-dot-grid" />

      {/* top rail, like a gallery label */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-start justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div data-scroll="rise">
          <span className="rounded-full bg-[#17c19a]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#17c19a]">
            Stores on Confirmly
          </span>
          <h2 className="mt-4 max-w-xl text-3xl font-extrabold tracking-tight text-[#111827] sm:text-5xl">
            Real businesses, <span className="text-[#17c19a]">every niche.</span>
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-gray-600 sm:text-lg">
            From fashion to phone accessories — shops already taking verified
            payments straight from WhatsApp.
          </p>
        </div>
        <Link
          href="/stores"
          className="hidden shrink-0 items-center gap-1.5 pt-1 text-xs font-bold uppercase tracking-wider text-gray-500 transition hover:text-[#17c19a] sm:inline-flex"
        >
          All stores
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* the wall */}
      <div data-scroll="zoom" className="relative mt-6 sm:mt-2">
        {/* perspective floor grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] overflow-hidden"
          style={{ perspective: "520px", perspectiveOrigin: "50% 0%" }}
        >
          <div
            className="absolute -inset-x-1/2 top-0 h-[260%] origin-top"
            style={{
              transform: "rotateX(72deg)",
              backgroundImage:
                "linear-gradient(rgba(23,193,154,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(23,193,154,0.22) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)",
            }}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 45% 40% at 50% 42%, rgba(23,193,154,0.14), transparent 70%)" }}
        />

        <div
          ref={stageRef}
          className="relative h-[420px] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
          style={{ perspectiveOrigin: "50% 42%" }}
        >
          <div className="absolute inset-0 [transform-style:preserve-3d]">
            {slots.map((store, i) => (
              <div
                key={`${store.id}-${i}`}
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${(i % stores.length) + 1} of ${stores.length}: ${store.name}`}
                className="group absolute left-1/2 top-1/2 overflow-hidden rounded-[1.1em] border border-gray-200 bg-white shadow-[0_40px_70px_-30px_rgba(17,24,39,0.35)] [backface-visibility:hidden] [will-change:transform,opacity]"
              >
                <StoreArtwork store={store} eager={i < 3} className="text-[1em]" />

                {/* side cards sink into the dark */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[#f8faf9]"
                  style={{ opacity: "calc(var(--dim, 0) * 0.35)" }}
                />
                <div aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/5" />

                <div className="absolute left-[0.9em] top-[0.9em] flex flex-wrap gap-[0.4em]">
                  <span className="rounded-full bg-white/90 px-[0.8em] py-[0.35em] text-[0.68em] font-bold uppercase tracking-[0.08em] text-[#111827] shadow-sm backdrop-blur">
                    {store.category}
                  </span>
                  {store.rating ? (
                    <span className="inline-flex items-center gap-[0.25em] rounded-full bg-[#111827]/80 px-[0.7em] py-[0.35em] text-[0.68em] font-bold text-white backdrop-blur">
                      <Star className="h-[1em] w-[1em] fill-amber-400 text-amber-400" aria-hidden />
                      {store.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>

                <div
                  className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-[0.8em] p-[0.9em] pt-[3em]"
                  style={{ background: "linear-gradient(180deg, transparent, rgba(17,24,39,0.7))" }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[1.35em] font-bold tracking-[-0.01em] text-white">
                      {store.name}
                    </p>
                    <p className="truncate text-[0.72em] font-medium text-white/65">
                      {store.location ? `${store.location} · ` : ""}
                      {store.productCount} product{store.productCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link
                    href={store.waLink ?? `/stores?q=${encodeURIComponent(store.storeCode)}`}
                    {...(store.waLink ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    aria-label={store.waLink ? `Order from ${store.name} on WhatsApp` : `View ${store.name}`}
                    className="flex h-[2.3em] w-[2.3em] shrink-0 items-center justify-center rounded-full bg-white text-[#111827] shadow-md transition group-hover:bg-[#17c19a] group-hover:text-white"
                  >
                    <ArrowRight className="h-[1em] w-[1em]" aria-hidden />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* bottom rail: counter, arrows, see more */}
      <div className="relative z-10 mx-auto mt-2 flex w-full max-w-7xl flex-col items-center gap-6 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <p className="order-2 text-xs font-bold uppercase tracking-wider text-gray-500 sm:order-1" aria-live="polite">
          <span className="text-[#111827]">Featured</span> / {String(realIndex + 1).padStart(2, "0")} of{" "}
          {String(stores.length).padStart(2, "0")} · {current.category}
        </p>

        <div className="order-1 flex items-center gap-3 sm:order-2">
          <button
            type="button"
            onClick={() => goRef.current(-1)}
            aria-label="Previous store"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-[#17c19a] hover:text-[#17c19a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goRef.current(1)}
            aria-label="Next store"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-[#17c19a] hover:text-[#17c19a]"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <Link
            href="/stores"
            className="ml-1 inline-flex items-center gap-2 rounded-full bg-[#17c19a] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#17c19a]/25 transition hover:bg-[#0fa17f] active:scale-95"
          >
            See more stores
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
