import type { CompositePreset, VaultData, VaultItem } from "./types";

export interface UsageStats {
  totalAppTimeSeconds: number;
  totalSwaps: number;
  totalUploads: number;
  overlayTime: Record<string, number>;
}

export const STORAGE_KEY = "iris_usage_stats";

export const DEFAULT_USAGE: UsageStats = {
  totalAppTimeSeconds: 0,
  totalSwaps: 0,
  totalUploads: 0,
  overlayTime: {},
};

export function loadUsage(): UsageStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USAGE };
    const p = JSON.parse(raw);
    return {
      totalAppTimeSeconds: Number(p.totalAppTimeSeconds) || 0,
      totalSwaps: Number(p.totalSwaps) || 0,
      totalUploads: Number(p.totalUploads) || 0,
      overlayTime: typeof p.overlayTime === "object" && p.overlayTime !== null ? p.overlayTime : {},
    };
  } catch {
    return { ...DEFAULT_USAGE };
  }
}

export function saveUsage(stats: UsageStats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export interface FavOverlayInfo {
  name: string;
  timeFormatted: string;
  timeSeconds: number;
  sub: string;
  isStarred: boolean;
  item?: VaultItem | null;
  preset?: CompositePreset | null;
  tag?: string | null;
  isRecentFallback?: boolean;
}

export function computeFavoriteOverlay(
  vault: VaultData | null | undefined,
  usageStats: UsageStats | undefined,
  activeItemId?: string | null,
): FavOverlayInfo {
  if (!vault || (!vault.items.length && !vault.presets.length)) {
    return {
      name: "None yet",
      timeFormatted: "0m",
      timeSeconds: 0,
      sub: "No overlays uploaded",
      isStarred: false,
      item: null,
      preset: null,
      tag: null,
      isRecentFallback: false,
    };
  }

  const times = usageStats?.overlayTime ?? {};
  let bestTime = 0;
  let bestName = "";
  let bestSub = "";
  let isStarred = false;
  let bestItem: VaultItem | null = null;
  let bestPreset: CompositePreset | null = null;
  let bestTag: string | null = null;

  for (const item of vault.items) {
    const t = times[item.id] ?? 0;
    if (t > bestTime) {
      bestTime = t;
      bestName = item.name;
      bestSub = item.game;
      isStarred = !!item.favorite;
      bestItem = item;
      bestPreset = null;
      bestTag = item.tag ?? null;
    }
  }

  for (const p of vault.presets) {
    const t = times[`preset:${p.id}`] ?? times[p.id] ?? 0;
    if (t > bestTime) {
      bestTime = t;
      bestName = `Loadout: ${p.name}`;
      bestSub = p.game || "Composite Stack";
      isStarred = true;
      bestPreset = p;
      bestItem = null;
      bestTag = "stack";
    }
  }

  let isRecentFallback = false;
  if (bestTime === 0) {
    isRecentFallback = true;
    const fallback =
      vault.items.find((i) => i.favorite) ||
      (activeItemId ? vault.items.find((i) => i.id === activeItemId) : null) ||
      vault.items[0];
    if (fallback) {
      bestName = fallback.name;
      bestSub = fallback.game;
      bestTime = times[fallback.id] ?? 0;
      isStarred = !!fallback.favorite;
      bestItem = fallback;
      bestTag = fallback.tag ?? null;
    } else if (vault.presets.length > 0) {
      const p0 = vault.presets[0];
      bestName = `Loadout: ${p0.name}`;
      bestSub = p0.game || "Composite Stack";
      bestTime = times[`preset:${p0.id}`] ?? 0;
      isStarred = true;
      bestPreset = p0;
      bestTag = "stack";
    }
  }

  return {
    name: (isStarred && !bestName.startsWith("★") ? "★ " : "") + bestName,
    timeFormatted: formatDuration(bestTime),
    timeSeconds: bestTime,
    sub: bestSub,
    isStarred,
    item: bestItem,
    preset: bestPreset,
    tag: bestTag,
    isRecentFallback,
  };
}
