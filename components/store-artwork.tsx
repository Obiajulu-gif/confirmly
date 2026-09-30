import type { PublicStore } from "@/lib/stores";

/**
 * Card artwork for a store. Stores with product photos get an editorial
 * collage; stores without get a typographic poster tinted by their niche, so
 * a brand-new store still looks deliberate rather than empty.
 */

/** Stable hue per category, so a niche keeps its colour everywhere. */
function hueFor(category: string): number {
  let h = 0;
  for (const ch of category.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function StoreArtwork({
  store,
  className = "",
  eager = false,
}: {
  store: Pick<PublicStore, "name" | "storeCode" | "category" | "images" | "logoUrl">;
  className?: string;
  eager?: boolean;
}) {
  const imgs = store.images;
  const loading = eager ? "eager" : "lazy";

  if (imgs.length === 0) {
    const hue = hueFor(store.category);
    return (
      <div
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{
          background: `radial-gradient(120% 90% at 85% 10%, hsl(${hue} 70% 62% / 0.55), transparent 60%), linear-gradient(135deg, hsl(${hue} 30% 94%), hsl(${(hue + 40) % 360} 25% 86%))`,
        }}
      >
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(17,24,39,0.35)_1px,transparent_1px)] [background-size:14px_14px]" />
        <div className="absolute inset-x-[7%] top-[12%] text-[#111827]">
          <p className="font-mono text-[0.62em] font-semibold uppercase tracking-[0.2em] opacity-60">
            ({store.storeCode})
          </p>
          <p className="mt-[0.25em] line-clamp-2 break-words text-[2.1em] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]">
            {store.name}
          </p>
          <p className="mt-[0.5em] text-[0.7em] font-semibold uppercase tracking-[0.14em] opacity-60">
            {store.category}
          </p>
        </div>
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt=""
            loading={loading}
            draggable={false}
            className="absolute bottom-[14%] right-[7%] h-[28%] w-auto rounded-[0.6em] object-contain shadow-lg"
          />
        ) : null}
      </div>
    );
  }

  // 1 photo fills the card; 2 split it; 3–4 become a lead image plus a stack.
  const [lead, ...rest] = imgs;
  const tile = (src: string, key: string | number, cls = "") => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={key}
      src={src}
      alt=""
      loading={loading}
      decoding="async"
      draggable={false}
      className={`h-full w-full min-h-0 object-cover ${cls}`}
    />
  );

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#e9edf0] ${className}`}>
      {imgs.length === 1 ? (
        tile(lead!, 0)
      ) : imgs.length === 2 ? (
        <div className="grid h-full grid-cols-2 gap-[3px]">{imgs.map((s, i) => tile(s, i))}</div>
      ) : (
        <div className="grid h-full grid-cols-[1.35fr_1fr] gap-[3px]">
          {tile(lead!, "lead")}
          <div className="grid min-h-0 gap-[3px]" style={{ gridTemplateRows: `repeat(${rest.length}, minmax(0, 1fr))` }}>
            {rest.map((s, i) => tile(s, i))}
          </div>
        </div>
      )}
    </div>
  );
}
