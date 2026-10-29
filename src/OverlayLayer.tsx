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
  const safeImgW = Math.max(1, Number.isFinite(imgW) ? imgW : 1);
  const safeImgH = Math.max(1, Number.isFinite(imgH) ? imgH : 1);
  const safeScale = Number.isFinite(t.scale) ? Math.max(1, t.scale) : 100;
  const safeX = Number.isFinite(t.x) ? t.x : 0;
  const safeY = Number.isFinite(t.y) ? t.y : 0;
  const w = (safeImgW * safeScale) / 100;
  const h = (safeImgH * safeScale) / 100;
  const img: CSSProperties = {
    position: "absolute",
    left: monitorW / 2 + safeX - w / 2,
    top: monitorH / 2 + safeY - h / 2,
    width: w,
    height: h,
    opacity: t.opacity / 100,
    filter: filters.length ? filters.join(" ") : undefined,
    animation: t.chromaCycle ? `irisRainbow ${t.chromaSpeed || 6}s linear infinite` : undefined,
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
