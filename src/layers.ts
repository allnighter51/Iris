import {
  ROLES,
  fxOf,
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

/**
 * Visible layers resolved to absolute paths, ordered back-to-front for drawing.
 * `factor` scales the authored canvas to the real monitor (resolution switcher).
 */
export function toScene(layers: Layer[], vault: VaultData, factor = 1): SceneLayer[] {
  const byId = new Map(vault.items.map((i) => [i.id, i]));
  const out: SceneLayer[] = [];
  for (const l of [...layers].reverse()) {
    const it = byId.get(l.vaultItemId);
    if (!l.visible || !it) continue;
    out.push({
      path: `${vault.assetsDir}\\${it.file}`,
      width: it.width,
      height: it.height,
      transform: {
        x: l.x * factor,
        y: l.y * factor,
        scale: l.scale * factor,
        opacity: l.opacity,
        hue: l.hue,
        brightness: 100,
        contrast: 100,
      },
      fx: fxOf(l),
    });
  }
  return out;
}

export type EffectiveOverlay = OverlayState;

/** Visible (post-crop) rectangle of a layer in centre-origin canvas pixels. */
export interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
}

export function layerBox(l: Layer, iw: number, ih: number): Box {
  const fx = fxOf(l);
  const w = (iw * l.scale) / 100;
  const h = (ih * l.scale) / 100;
  // crop is defined on the source image; flipping mirrors the whole image about its centre
  const cl = fx.flipX ? fx.cropR : fx.cropL;
  const cr = fx.flipX ? fx.cropL : fx.cropR;
  const ct = fx.flipY ? fx.cropB : fx.cropT;
  const cb = fx.flipY ? fx.cropT : fx.cropB;
  return {
    l: l.x - w / 2 + (w * cl) / 100,
    t: l.y - h / 2 + (h * ct) / 100,
    w: (w * (100 - cl - cr)) / 100,
    h: (h * (100 - ct - cb)) / 100,
  };
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** guide lines in top-left canvas pixels */
  xs: number[];
  ys: number[];
}

function snapAxis(cands: number[], targets: number[], thr: number) {
  let best: { d: number; off: number } | null = null;
  for (const c of cands)
    for (const t of targets) {
      const d = Math.abs(t - c);
      if (d <= thr && (!best || d < best.d)) best = { d, off: t - c };
    }
  return best ? best.off : 0;
}

/**
 * Photoshop-style smart guides: snap a moving box's edges/centre to the canvas
 * edges/centre and to every other visible layer's edges/centre.
 */
export function snapBox(b: Box, W: number, H: number, others: Box[], thr: number, grid = 0): SnapResult {
  const tx = [-W / 2, 0, W / 2];
  const ty = [-H / 2, 0, H / 2];
  for (const o of others) {
    tx.push(o.l, o.l + o.w / 2, o.l + o.w);
    ty.push(o.t, o.t + o.h / 2, o.t + o.h);
  }
  let dx = 0;
  let dy = 0;
  if (grid > 0) {
    dx = Math.round(b.l / grid) * grid - b.l;
    dy = Math.round(b.t / grid) * grid - b.t;
  }
  const ox = snapAxis([b.l, b.l + b.w / 2, b.l + b.w], tx, thr);
  const oy = snapAxis([b.t, b.t + b.h / 2, b.t + b.h], ty, thr);
  if (ox) dx = ox;
  if (oy) dy = oy;
  const nl = b.l + dx;
  const nt = b.t + dy;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of [nl, nl + b.w / 2, nl + b.w]) if (tx.some((t) => Math.abs(t - c) < 0.5)) xs.push(c + W / 2);
  for (const c of [nt, nt + b.h / 2, nt + b.h]) if (ty.some((t) => Math.abs(t - c) < 0.5)) ys.push(c + H / 2);
  return { dx, dy, xs, ys };
}