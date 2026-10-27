import { useMemo } from "react";
import { assetUrl } from "../api";
import { fxOf, type Layer, type VaultData } from "../types";

/**
 * Pure-CSS (percent-positioned) stack renderer used for the Layering canvas and
 * STACK thumbnails. The live overlay window uses a single canvas instead.
 */
export function SceneImages({
  layers,
  vault,
  refW,
  refH,
}: {
  layers: Layer[];
  vault: VaultData;
  refW: number;
  refH: number;
}) {
  const byId = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", pointerEvents: "none" }}>
      {[...layers].reverse().map((l) => {
        const it = byId.get(l.vaultItemId);
        if (!l.visible || !it) return null;
        const fx = fxOf(l);
        const w = (it.width * l.scale) / 100;
        const h = (it.height * l.scale) / 100;
        const cropped = fx.cropT || fx.cropR || fx.cropB || fx.cropL;
        return (
          <img
            key={l.id}
            src={assetUrl(vault.assetsDir, it.file)}
            draggable={false}
            alt=""
            style={{
              position: "absolute",
              left: `${((refW / 2 + l.x - w / 2) / refW) * 100}%`,
              top: `${((refH / 2 + l.y - h / 2) / refH) * 100}%`,
              width: `${(w / refW) * 100}%`,
              height: `${(h / refH) * 100}%`,
              opacity: l.opacity / 100,
              filter: l.hue ? `hue-rotate(${l.hue}deg)` : undefined,
              clipPath: cropped ? `inset(${fx.cropT}% ${fx.cropR}% ${fx.cropB}% ${fx.cropL}%)` : undefined,
              transform: fx.flipX || fx.flipY ? `scale(${fx.flipX ? -1 : 1}, ${fx.flipY ? -1 : 1})` : undefined,
              mixBlendMode: fx.blend && fx.blend !== "normal" ? (fx.blend as React.CSSProperties["mixBlendMode"]) : undefined,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}
export function StackThumb({ layers, vault, refW, refH }: { layers: Layer[]; vault: VaultData; refW: number; refH: number }) {
  return (
    <div className="stack-thumb" style={{ aspectRatio: `${refW} / ${refH}` }}>
      <SceneImages layers={layers} vault={vault} refW={refW} refH={refH} />
    </div>
  );
}

export type RefKey = "grid" | "custom";

export const REF_OPTIONS: { id: RefKey; label: string }[] = [
  { id: "grid", label: "Dark Grid" },
  { id: "custom", label: "Custom In-Game Screenshot" },
];