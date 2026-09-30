"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ---------------------------------------------------------------------------
   Page-wide scroll motion.

   Lenis eases the wheel while keeping native scrolling, so `position: sticky`
   and anchor links still behave. GSAP ScrollTrigger then scrubs motion off
   the scroll position, opted into from markup with data attributes:

     data-scroll="rise"      drifts up and fades in as it enters
     data-scroll="zoom"      grows from slightly smaller as it enters
     data-scroll="hero"      lifts away and fades as the page scrolls past it
     data-scroll="stack"     a sticky card that sinks back as the next covers it
     data-speed="0.2"        parallax: moves at a different rate to the page
     data-count              counts its number up once, on first sight

   Everything is skipped when the visitor prefers reduced motion.
--------------------------------------------------------------------------- */

export function ScrollMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: 0.1, anchors: { offset: -96 }, autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-scroll="rise"]').forEach((el) => {
        gsap.fromTo(
          el,
          { y: 70, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top 98%", end: "top 62%", scrub: 0.6 },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>('[data-scroll="zoom"]').forEach((el) => {
        gsap.fromTo(
          el,
          { scale: 0.9, opacity: 0.4, y: 40 },
          {
            scale: 1,
            opacity: 1,
            y: 0,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top 100%", end: "top 45%", scrub: 0.6 },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>('[data-scroll="hero"]').forEach((el) => {
        gsap.to(el, {
          y: -90,
          opacity: 0.15,
          ease: "none",
          scrollTrigger: { trigger: el.closest("section") ?? el, start: "top top", end: "bottom top", scrub: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-speed]").forEach((el) => {
        const speed = Number(el.dataset.speed) || 0;
        gsap.fromTo(
          el,
          { y: () => speed * 120 },
          {
            y: () => -speed * 120,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          }
        );
      });

      // Each sticky step sinks and dims while the next one slides over it.
      const stack = gsap.utils.toArray<HTMLElement>('[data-scroll="stack"]');
      stack.forEach((card, i) => {
        const next = stack[i + 1];
        if (!next) return;
        gsap.to(card, {
          scale: 0.92,
          opacity: 0.45,
          ease: "none",
          scrollTrigger: { trigger: next, start: "top 85%", end: "top 30%", scrub: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const match = el.textContent?.match(/^(\d+)(.*)$/);
        if (!match) return;
        const end = Number(match[1]);
        const suffix = match[2] ?? "";
        const state = { v: 0 };
        el.textContent = `0${suffix}`;
        gsap.to(state, {
          v: end,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
          onUpdate: () => {
            el.textContent = `${Math.round(state.v)}${suffix}`;
          },
        });
      });
    });

    // Late-loading images/video change section heights; re-measure once settled.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);

    return () => {
      window.removeEventListener("load", refresh);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
