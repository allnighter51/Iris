import type { CSSProperties } from "react";
import type { Transform } from "./types";

interface Props {
  src: string;
  imgW: number;
  imgH: number;
  t: Transform;
  /** monitor size in physical pixels */
  monitorW: number;
  monitorH: number;
  /** css px per monitor px */
  k: number;
  lowRes?: boolean;
  /** extra decorations (preview only) */
  children?: React.ReactNode;
}

/**
 * Shared renderer used by BOTH the live preview and the real overlay window, so
 * what you see in Display is exactly what is projected. Everything is laid out
 * in physical monitor pixels, then uniformly scaled by `k`.
 */
export function OverlayLayer({ src, imgW, imgH, t, monitorW, monitorH, k, lowRes, children }: Props) {
  const filters: string[] = [];
  if (!lowRes) {
    if (t.hue !== 0) filters.push(`hue-rotate(${t.hue}deg)`);
    if (t.brightness !== 100) filters.push(`brightness(${t.brightness}%)`);
    if (t.contrast !== 100) filters.push(`contrast(${t.contrast}%)`);
  }
  const w = (imgW * t.scale) / 100;
  const h = (imgH * t.scale) / 100;
  const img: CSSProperties = {
    position: "absolute",
    left: monitorW / 2 + t.x - w / 2,
    top: monitorH / 2 + t.y - h / 2,
    width: w,
    height: h,
    opacity: t.opacity / 100,
    filter: filters.length ? filters.join(" ") : undefined,
    pointerEvents: "none",
    userSelect: "none",
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: monitorW,
        height: monitorH,
        transform: `scale(${k})`,
        transformOrigin: "0 0",
        overflow: "hidden",
      }}
    >
      <img src={src} draggable={false} style={img} alt="" />
      {children}
    </div>
  );
}
