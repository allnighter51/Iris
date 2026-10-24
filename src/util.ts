import type { VaultItem } from "./types";
import { FILTER_GAMES } from "./types";

export type SortKey = "new" | "name" | "game";

export function resolutionTag(w: number, h: number): string {
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K";
  if (h >= 1080) return "1080p";
  return `${w}x${h}`;
}

export function gameClass(game: string): string {
  return "g-" + game.toLowerCase().replace(/[^a-z]+/g, "-");
}

export function filterItems(
  items: VaultItem[],
  filter: string,
  query = "",
  sort: SortKey = "new",
): VaultItem[] {
  const q = query.trim().toLowerCase();
  const isGame = (FILTER_GAMES as readonly string[]).includes(filter);
  const out = items.filter((i) => {
    if (filter === "Favorites") {
      if (!i.favorite) return false;
    } else if (filter !== "All") {
      if (isGame ? i.game !== filter : i.folder !== filter) return false;
    }
    return !q || i.name.toLowerCase().includes(q) || i.game.toLowerCase().includes(q);
  });
  out.sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "game"
        ? a.game.localeCompare(b.game) || a.name.localeCompare(b.name)
        : b.createdAt - a.createdAt,
  );
  return out;
}

export function monitorLabel(m: { index: number; width: number; height: number; refreshHz: number }) {
  return `Display ${m.index + 1}: ${m.width}x${m.height}${m.refreshHz ? ` @ ${m.refreshHz}Hz` : ""}`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Decode an image, verify it contains real transparency, and build a thumbnail. */
export async function analyzeImage(file: File) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) {
      hasAlpha = true;
      break;
    }
  }
  return { bmp, width: bmp.width, height: bmp.height, hasAlpha };
}

export async function makeThumbnail(bmp: ImageBitmap): Promise<Uint8Array> {
  const k = Math.min(1, 480 / bmp.width, 270 / bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("thumbnail failed"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
