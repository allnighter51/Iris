import {
  DEFAULT_FX,
  ROLES,
  fxOf,
  type Layer,
  type Role,
  type SceneLayer,
  type VaultData,
  type VaultItem,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const roleBadge = (r: Role) => ROLES.find((x) => x.id === r)?.badge ?? "CUSTOM";

export const tagToRole = (tag?: string | null): Role =>
  tag === "ult" ? "ult" : tag === "map" ? "map" : tag === "health" ? "ability" : tag === "reticle" ? "crosshair" : "base";

export function newLayer(item: VaultItem, at?: { x: number; y: number }): Layer {
  const t = item.transform;
  return {
    id: uid(),
    vaultItemId: item.id,
    name: item.name,
    role: tagToRole(item.tag),
    zIndex: 0,
    visible: true,
    locked: false,
    x: at ? at.x : (t?.x ?? 0),
    y: at ? at.y : (t?.y ?? 0),
    scale: t?.scale ?? 100,
    opacity: t?.opacity ?? 100,
    hue: t?.hue ?? 0,
    fx: { ...DEFAULT_FX },
  };
}

export const withZ = (layers: Layer[]): Layer[] =>
  layers.map((l, i) => ({ ...l, zIndex: layers.length - 1 - i }));

export const fromPreset = (layers: Layer[]): Layer[] =>
  [...layers].sort((a, b) => b.zIndex - a.zIndex).map((l) => ({ ...l, id: l.id || uid(), fx: fxOf(l) }));

export function parsePresetPayload(
  rawText: string,
  items: VaultItem[],
): { name: string; game: string | null; refW: number; refH: number; layers: Layer[] } | null {
  let trimmed = rawText.trim();
  if (trimmed.startsWith("IRIS-PRESET:")) {
    trimmed = trimmed.slice("IRIS-PRESET:".length).trim();
    try {
      trimmed = decodeURIComponent(escape(atob(trimmed)));
    } catch {
      try {
        trimmed = atob(trimmed);
      } catch {
        return null;
      }
    }
  }
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.layers)) return null;

  const layers: Layer[] = parsed.layers.map((l: any, idx: number) => {
    const matched =
      items.find((i) => i.id === l.vaultItemId) ||
      (l.assetFile && items.find((i) => i.file === l.assetFile)) ||
      (l.assetName && items.find((i) => i.name.toLowerCase() === String(l.assetName).toLowerCase())) ||
      items[0];
    return {
      id: uid(),
      vaultItemId: matched?.id ?? (items[0]?.id || "item_1"),
      name: l.name || matched?.name || `Layer ${idx + 1}`,
      role: l.role || "custom",
      zIndex: typeof l.zIndex === "number" ? l.zIndex : idx,
      visible: l.visible !== false,
      locked: !!l.locked,
      x: Number(l.x) || 0,
      y: Number(l.y) || 0,
      scale: Number(l.scale) || 100,
      opacity: typeof l.opacity === "number" ? l.opacity : 100,
      hue: Number(l.hue) || 0,
      fx: fxOf({ fx: l.fx }),
    };
  });

  return {
    name: parsed.name || "Imported Loadout",
    game: parsed.game || null,
    refW: Number(parsed.refW) || 1920,
    refH: Number(parsed.refH) || 1080,
    layers,
  };
}

export function toScene(layers: Layer[], vault: VaultData, factor = 1): SceneLayer[] {
  const byId = new Map(vault.items.map((i) => [i.id, i]));
  const out: SceneLayer[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.visible) continue;
    const it = byId.get(l.vaultItemId);
    if (!it) continue;
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

export interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
}

export function layerBox(l: Layer, imgW: number, imgH: number): Box {
  const fx = fxOf(l);
  const fw = (imgW * l.scale) / 100;
  const fh = (imgH * l.scale) / 100;
  const visL = ((fx.flipX ? fx.cropR : fx.cropL) / 100) * fw;
  const visR = ((fx.flipX ? fx.cropL : fx.cropR) / 100) * fw;
  const visT = ((fx.flipY ? fx.cropB : fx.cropT) / 100) * fh;
  const visB = ((fx.flipY ? fx.cropT : fx.cropB) / 100) * fh;
  return {
    l: l.x - fw / 2 + visL,
    t: l.y - fh / 2 + visT,
    w: Math.max(4, fw - visL - visR),
    h: Math.max(4, fh - visT - visB),
  };
}

export function snapBox(
  box: Box,
  W: number,
  H: number,
  others: Box[],
  thresh: number,
  gridStep: number,
): { dx: number; dy: number; xs: number[]; ys: number[] } {
  const xTargets = [-W / 2, 0, W / 2, ...others.flatMap((b) => [b.l, b.l + b.w / 2, b.l + b.w])];
  const yTargets = [-H / 2, 0, H / 2, ...others.flatMap((b) => [b.t, b.t + b.h / 2, b.t + b.h])];

  const snap1D = (edges: number[], targets: number[], half: number) => {
    let best = thresh + 1;
    let delta = 0;
    let guide: number | null = null;
    if (thresh > 0) {
      for (const e of edges) {
        for (const t of targets) {
          const d = Math.abs(e - t);
          if (d < best) {
            best = d;
            delta = t - e;
            guide = t + half;
          }
        }
      }
    }
    if (guide === null && gridStep > 0) {
      delta = Math.round(edges[1] / gridStep) * gridStep - edges[1];
    }
    return { delta, guide };
  };

  const sx = snap1D([box.l, box.l + box.w / 2, box.l + box.w], xTargets, W / 2);
  const sy = snap1D([box.t, box.t + box.h / 2, box.t + box.h], yTargets, H / 2);
  return {
    dx: sx.delta,
    dy: sy.delta,
    xs: sx.guide !== null ? [sx.guide] : [],
    ys: sy.guide !== null ? [sy.guide] : [],
  };
}
