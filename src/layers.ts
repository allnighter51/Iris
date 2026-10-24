import {
  ROLES,
  type Layer,
  type OverlayState,
  type Role,
  type SceneLayer,
  type VaultData,
  type VaultItem,
} from "./types";

export const roleBadge = (r: Role) => ROLES.find((x) => x.id === r)?.badge ?? "CUSTOM";

export function roleFromTag(tag?: string | null): Role {
  switch (tag) {
    case "ult": return "ult";
    case "map": return "map";
    case "reticle": return "crosshair";
    case "hud":
    case "health": return "base";
    default: return "custom";
  }
}

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export function newLayer(item: VaultItem, at?: { x: number; y: number }): Layer {
  const cal = item.transform;
  return {
    id: uid(),
    vaultItemId: item.id,
    name: item.name,
    role: roleFromTag(item.tag),
    zIndex: 0,
    visible: true,
    locked: false,
    x: at?.x ?? cal?.x ?? 0,
    y: at?.y ?? cal?.y ?? 0,
    scale: cal?.scale ?? 100,
    opacity: cal?.opacity ?? 100,
    hue: cal?.hue ?? 0,
  };
}

/** Stack arrays are top-first; persisted zIndex is higher = in front. */
export const withZ = (layers: Layer[]): Layer[] =>
  layers.map((l, i) => ({ ...l, zIndex: layers.length - 1 - i }));

export const fromPreset = (layers: Layer[]): Layer[] =>
  [...layers].sort((a, b) => b.zIndex - a.zIndex);

/** Visible layers resolved to absolute paths, ordered back-to-front for drawing. */
export function toScene(layers: Layer[], vault: VaultData): SceneLayer[] {
  const byId = new Map(vault.items.map((i) => [i.id, i]));
  const out: SceneLayer[] = [];
  for (const l of [...layers].reverse()) {
    const it = byId.get(l.vaultItemId);
    if (!l.visible || !it) continue;
    out.push({
      path: `${vault.assetsDir}\\${it.file}`,
      width: it.width,
      height: it.height,
      transform: { x: l.x, y: l.y, scale: l.scale, opacity: l.opacity, hue: l.hue, brightness: 100, contrast: 100 },
    });
  }
  return out;
}

export type EffectiveOverlay = OverlayState;

/** `snap1`: snap a layer centre offset to screen centre / edges. Returns guide in monitor px. */
export function snap1(pos: number, size: number, total: number, thr: number) {
  const cands = [
    { v: 0, g: total / 2 },
    { v: -total / 2 + size / 2, g: 0 },
    { v: total / 2 - size / 2, g: total },
  ];
  let best: { d: number; v: number; g: number } | null = null;
  for (const c of cands) {
    const d = Math.abs(pos - c.v);
    if (d <= thr && (!best || d < best.d)) best = { d, ...c };
  }
  return best ? { pos: best.v, guide: best.g } : { pos, guide: null as number | null };
}
