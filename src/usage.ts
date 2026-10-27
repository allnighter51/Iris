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
    const parsed = JSON.parse(raw);
    return {
      totalAppTimeSeconds: Number(parsed.totalAppTimeSeconds) || 0,
      totalSwaps: Number(parsed.totalSwaps) || 0,
      totalUploads: Number(parsed.totalUploads) || 0,
      overlayTime:
        typeof parsed.overlayTime === "object" && parsed.overlayTime !== null
          ? parsed.overlayTime
          : {},
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

  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h`;
  }
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
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
  activeItemId?: string | null
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

  // 1. Scan single vault items
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

  // 2. Scan composite stack presets
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

  // 3. Fallback to starred item, active item, or first item if no item has accumulated time yet
  if (bestTime === 0) {
    isRecentFallback = true;
    const starred = vault.items.find((i) => i.favorite);
    const active = activeItemId ? vault.items.find((i) => i.id === activeItemId) : null;
    const fallback = starred || active || vault.items[0];

    if (fallback) {
      bestName = fallback.name;
      bestSub = fallback.game;
      bestTime = times[fallback.id] ?? 0;
      isStarred = !!fallback.favorite;
      bestItem = fallback;
      bestPreset = null;
      bestTag = fallback.tag ?? null;
    } else if (vault.presets.length > 0) {
      bestName = `Loadout: ${vault.presets[0].name}`;
      bestSub = vault.presets[0].game || "Composite Stack";
      bestTime = times[`preset:${vault.presets[0].id}`] ?? 0;
      isStarred = true;
      bestPreset = vault.presets[0];
      bestItem = null;
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
