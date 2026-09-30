import type { PublicStore } from "@/lib/stores";

/**
 * Card artwork for a store: a grid of the vendor's logo and their product
 * photos. A store with neither gets a plain tinted placeholder with its
 * initials.
 */

const MAX_TILES = 4;

/** Stable hue per category, so a niche keeps its colour everywhere. */
function hueFor(category: string): number {
  let h = 0;
  for (const ch of category.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

type Tile = { kind: "logo" | "photo"; src: string };

export function StoreArtwork({
  store,
  className = "",
  eager = false,
}: {
  store: Pick<PublicStore, "name" | "storeCode" | "category" | "images" | "logoUrl">;
  className?: string;
  eager?: boolean;
}) {
  const loading = eager ? "eager" : "lazy";
  const hue = hueFor(store.category);
  const tint = `linear-gradient(135deg, hsl(${hue} 45% 95%), hsl(${(hue + 35) % 360} 40% 88%))`;

  const tiles: Tile[] = [
    ...(store.logoUrl ? [{ kind: "logo" as const, src: store.logoUrl }] : []),
    ...store.images.map((src) => ({ kind: "photo" as const, src })),
  ].slice(0, MAX_TILES);

  if (tiles.length === 0) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden ${className}`}
        style={{ background: tint }}
      >
        <span
          className="text-[3em] font-extrabold tracking-tight"
          style={{ color: `hsl(${hue} 45% 35% / 0.85)` }}
        >
          {initials(store.name)}
        </span>
      </div>
    );
  }

  const tile = (t: Tile, i: number) =>
    t.kind === "logo" ? (
      <div
        key={`logo-${i}`}
        className={`flex min-h-0 items-center justify-center ${
          tiles.length === 1 ? "p-[16%_30%]" : "bg-white p-[18%]"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.src}
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          className={`max-h-full max-w-full object-contain ${tiles.length === 1 ? "rounded-[1em] bg-white p-[0.8em] shadow-md" : ""}`}
        />
      </div>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`photo-${i}`}
        src={t.src}
        alt=""
        loading={loading}
        decoding="async"
        draggable={false}
        className="h-full min-h-0 w-full object-cover"
      />
    );

  // 1 tile fills the card; 2 split it; 3 are a lead plus a stack; 4 a 2×2 grid.
  const layout =
    tiles.length === 1
      ? "grid-cols-1"
      : tiles.length === 2
        ? "grid-cols-2"
        : tiles.length === 3
          ? "grid-cols-[1.35fr_1fr] grid-rows-2 [&>*:first-child]:row-span-2"
          : "grid-cols-2 grid-rows-2";

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`} style={{ background: tint }}>
      <div className={`grid h-full gap-[3px] ${layout}`}>{tiles.map(tile)}</div>
    </div>
  );
}
