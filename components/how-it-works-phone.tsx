"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phone mockup for the "How it works" section, playing a silent screen
 * recording of the real WhatsApp ordering flow.
 *
 * The clip is muted and has no audio track at all — the only way a browser
 * will autoplay it — and it only runs while it is actually on screen, so it
 * costs nothing in battery or data once the visitor has scrolled past.
 *
 * If the video fails to load, the poster frame stays up, so a broken or
 * missing file degrades to a still image rather than an empty hole.
 */
export function HowItWorksPhone({
  src,
  poster,
  label,
}: {
  src: string;
  poster: string;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void video.play().catch(() => {
            /* autoplay refused — the poster stays up, which is fine */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  return (
    <div className="relative mx-auto w-[264px] sm:w-[288px]">
      {/* brand glow behind the device */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(23,193,154,0.22), rgba(23,193,154,0) 70%)",
        }}
      />

      <div className="rounded-[2.6rem] border border-white/15 bg-night-800 p-2.5 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.55)]">
        {/* no drawn notch: the screen recording carries the phone's own status bar */}
        <div className="relative aspect-[9/20] overflow-hidden rounded-[2.1rem] bg-[#0b141a]">
          {failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt={label}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              poster={poster}
              muted
              loop
              playsInline
              preload="none"
              aria-label={label}
              onError={() => setFailed(true)}
            >
              <source src={src} type="video/mp4" />
            </video>
          )}
        </div>
      </div>

      {/* side buttons, for a bit of device realism */}
      <div aria-hidden className="absolute -left-[3px] top-[22%] h-10 w-[3px] rounded-l bg-night-700" />
      <div aria-hidden className="absolute -left-[3px] top-[34%] h-16 w-[3px] rounded-l bg-night-700" />
      <div aria-hidden className="absolute -right-[3px] top-[28%] h-14 w-[3px] rounded-r bg-night-700" />
    </div>
  );
}
