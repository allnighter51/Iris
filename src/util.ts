import { FILTER_GAMES, type VaultItem } from "./types";

export type SortKey = "new" | "name" | "game";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const resolutionTag = (w: number, h: number): string =>
  h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 1080 ? "1080p" : `${w}x${h}`;

export const gameClass = (game: string): string =>
  "g-" + game.toLowerCase().replace(/[^a-z]+/g, "-");

export const monitorLabel = (m: { index: number; width: number; height: number; refreshHz: number }) =>
  `Display ${m.index + 1}: ${m.width}x${m.height}${m.refreshHz ? ` @ ${m.refreshHz}Hz` : ""}`;

export function filterItems(items: VaultItem[], filter: string, query = "", sort: SortKey = "new"): VaultItem[] {
  const q = query.trim().toLowerCase();
  const isGame = (FILTER_GAMES as readonly string[]).includes(filter);
  return items
    .filter((i) => {
      if (filter === "Favorites") return Boolean(i.favorite);
      if (filter !== "All" && (isGame ? i.game !== filter : i.folder !== filter)) return false;
      return !q || i.name.toLowerCase().includes(q) || i.game.toLowerCase().includes(q);
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "game"
          ? a.game.localeCompare(b.game) || a.name.localeCompare(b.name)
          : b.createdAt - a.createdAt,
    );
}

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
  try {
    const k = Math.min(1, 480 / bmp.width, 270 / bmp.height);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("thumbnail failed"))), "image/png"),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}
