import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";
import type { OverlayPayload, SceneLayer } from "./types";

const images = new Map<string, Promise<HTMLImageElement>>();

/** Decode each file once; later redraws reuse the decoded bitmap. */
function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    const img = new Image();
    img.src = convertFileSrc(path);
    p = img.decode().then(() => img);
    p.catch(() => images.delete(path));
    images.set(path, p);
  }
  return p;
}

/**
 * The transparent click-through window. Whether it shows one PNG or a whole
 * layer stack, everything is composited onto ONE canvas, and only when the
 * state changes. While idle there is no JS work, no animation loop and no
 * per-layer DOM — the compositor just presents a single static surface.
 */
function Overlay() {
  const [p, setP] = useState<OverlayPayload | null>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);

  useEffect(() => {
    api.overlayGet().then(setP);
    const un = listen<OverlayPayload>("overlay-state", (e) => setP(e.payload));
    const onResize = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", onResize);
    return () => {
      un.then((f) => f());
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !p) return;
    const my = ++token.current;
    const W = p.monitorW;
    const H = p.monitorH;
    const layers: SceneLayer[] = p.state.scene.length
      ? p.state.scene
      : p.state.path
        ? [{ path: p.state.path, width: p.state.width, height: p.state.height, transform: p.state.transform }]
        : [];

    if (!p.visible || !layers.length) {
      c.width = 1; // release the backbuffer while hidden
      c.height = 1;
      return;
    }
    Promise.all(layers.map((l) => loadImage(l.path).catch(() => null))).then((imgs) => {
      if (my !== token.current) return; // superseded by a newer state
      c.width = W; // also clears
      c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      // layers arrive back-to-front
      layers.forEach((l, i) => {
        const img = imgs[i];
        if (!img) return;
        const t = l.transform;
        const w = (l.width * t.scale) / 100;
        const h = (l.height * t.scale) / 100;
        const f: string[] = [];
        if (!p.lowRes) {
          if (t.hue) f.push(`hue-rotate(${t.hue}deg)`);
          if (t.brightness !== 100) f.push(`brightness(${t.brightness}%)`);
          if (t.contrast !== 100) f.push(`contrast(${t.contrast}%)`);
        }
        ctx.globalAlpha = t.opacity / 100;
        ctx.filter = f.length ? f.join(" ") : "none";
        ctx.drawImage(img, W / 2 + t.x - w / 2, H / 2 + t.y - h / 2, w, h);
      });
    });
  }, [p]);

  const W = p?.monitorW ?? 1;
  const H = p?.monitorH ?? 1;
  const isChroma = p?.state.transform.chromaCycle;
  const chromaDuration = p?.state.transform.chromaSpeed || 6;

  return (
    <canvas
      ref={canvas}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W / dpr,
        height: H / dpr,
        pointerEvents: "none",
        animation: isChroma ? `irisRainbow ${chromaDuration}s linear infinite` : undefined,
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
