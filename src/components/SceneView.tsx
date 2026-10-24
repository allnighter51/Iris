import { useMemo } from "react";
import { assetUrl } from "../api";
import type { Layer, VaultData } from "../types";

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
    <>
      {[...layers].reverse().map((l) => {
        const it = byId.get(l.vaultItemId);
        if (!l.visible || !it) return null;
        const w = (it.width * l.scale) / 100;
        const h = (it.height * l.scale) / 100;
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
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
}

export function StackThumb({ layers, vault, refW, refH }: { layers: Layer[]; vault: VaultData; refW: number; refH: number }) {
  return (
    <div className="stack-thumb" style={{ aspectRatio: `${refW} / ${refH}` }}>
      <SceneImages layers={layers} vault={vault} refW={refW} refH={refH} />
    </div>
  );
}

export type RefKey = "grid" | "custom" | "ow2" | "valorant" | "rivals" | "desktop";

export const REF_OPTIONS: { id: RefKey; label: string }[] = [
  { id: "grid", label: "Dark Grid" },
  { id: "custom", label: "Custom In-Game Screenshot" },
  { id: "ow2", label: "Overwatch 2 HUD Reference" },
  { id: "valorant", label: "Valorant HUD Reference" },
  { id: "rivals", label: "Marvel Rivals Reference" },
  { id: "desktop", label: "Live Desktop Preview" },
];

type Box = [label: string, x: number, y: number, w: number, h: number];

// Approximate schematic placements (1600x900) of each game's native HUD blocks.
const REF_BOXES: Record<"ow2" | "valorant" | "rivals", Box[]> = {
  ow2: [
    ["TEAM", 40, 40, 300, 150],
    ["KILL FEED", 1240, 40, 320, 190],
    ["HERO / HEALTH", 70, 700, 380, 150],
    ["ABILITIES", 1050, 740, 420, 110],
    ["ULTIMATE", 735, 745, 130, 110],
    ["OBJECTIVE", 640, 24, 320, 70],
  ],
  valorant: [
    ["MINIMAP", 24, 24, 280, 280],
    ["SCOREBOARD", 620, 18, 360, 56],
    ["KILL FEED", 1260, 40, 310, 180],
    ["HEALTH", 560, 790, 220, 60],
    ["ABILITIES", 650, 730, 300, 70],
    ["AMMO", 1350, 770, 210, 80],
  ],
  rivals: [
    ["MINIMAP", 24, 24, 260, 260],
    ["OBJECTIVE", 640, 20, 320, 70],
    ["KILL FEED", 1250, 40, 320, 180],
    ["HERO / HEALTH", 50, 700, 420, 160],
    ["ABILITIES", 1010, 730, 380, 110],
    ["ULTIMATE", 735, 735, 130, 120],
  ],
};

export function RefBackdrop({ kind }: { kind: "ow2" | "valorant" | "rivals" }) {
  return (
    <svg className="ref-svg" viewBox="0 0 1600 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id="refsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141b2e" />
          <stop offset="1" stopColor="#0b0c14" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#refsky)" />
      <g stroke="#ffffff22" strokeWidth="2">
        <path d="M790 450h-18M810 450h18M800 440v-14M800 460v14" />
      </g>
      {REF_BOXES[kind].map(([label, x, y, w, h]) => (
        <g key={label}>
          <rect x={x} y={y} width={w} height={h} rx="6" fill="#ffffff08" stroke="#64748b" strokeDasharray="8 6" strokeWidth="2" />
          <text x={x + 12} y={y + 26} fill="#64748b" fontFamily="JetBrains Mono, monospace" fontSize="20">
            {label}
          </text>
        </g>
      ))}
      <text x="800" y="888" textAnchor="middle" fill="#334155" fontFamily="JetBrains Mono, monospace" fontSize="16">
        SCHEMATIC REFERENCE - APPROXIMATE NATIVE HUD POSITIONS
      </text>
    </svg>
  );
}