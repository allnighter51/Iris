import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api";
import type { OverlayPayload, SceneLayer } from "./types";
import "./styles.css";

const MAX_UNUSED_CACHE = 12;
const images = new Map<string, Promise<HTMLImageElement>>();
const accessOrder: string[] = [];

/** Evict oldest unused decoded bitmaps to cap VRAM / memory footprint */
function pruneImageCache(activePaths: Set<string>) {
  const unused = accessOrder.filter((p) => !activePaths.has(p));
  while (unused.length > MAX_UNUSED_CACHE) {
    const oldest = unused.shift();
    if (oldest) {
      images.delete(oldest);
      const idx = accessOrder.indexOf(oldest);
      if (idx !== -1) accessOrder.splice(idx, 1);
    }
  }
}

/** Decode each file once; later redraws reuse the decoded bitmap with bounded LRU retention. */
function loadImage(path: string): Promise<HTMLImageElement> {
  const idx = accessOrder.indexOf(path);
  if (idx !== -1) accessOrder.splice(idx, 1);
  accessOrder.push(path);

  let p = images.get(path);
  if (!p) {
    const img = new Image();
    img.src = convertFileSrc(path);
    p = img.decode().then(() => img);
    p.catch(() => {
      images.delete(path);
      const i = accessOrder.indexOf(path);
      if (i !== -1) accessOrder.splice(i, 1);
    });
    images.set(path, p);
  }
  return p;
}

/**
 * The transparent click-through window. Whether it shows one PNG or a whole
 * layer stack, everything is composited onto ONE canvas, and only when the
 * state changes.
 */
function Overlay() {
  const [p, setP] = useState<OverlayPayload | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);
  const payloadSeq = useRef(0);

  useEffect(() => {
    const initialSeq = ++payloadSeq.current;
    api.overlayGet().then((res) => {
      if (initialSeq === payloadSeq.current) {
        setP(res);
      }
    });
    const un = listen<OverlayPayload>("overlay-state", (e) => {
      payloadSeq.current++;
      setP(e.payload);
    });
    return () => {
      un.then((f) => f());
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
    pruneImageCache(new Set(layers.map((l) => l.path)));
    Promise.all(layers.map((l) => loadImage(l.path).catch(() => null))).then((imgs) => {
      if (my !== token.current) return; // superseded by a newer state
      c.width = W; // also clears
      c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";

      const aspectMode = p.aspectScalingMode || "contain-16-9";
      let scaleX = 1;
      let scaleY = 1;

      if (aspectMode === "fill-screen" && H > 0) {
        const targetAspect = 16 / 9;
        const currentAspect = W / H;
        if (currentAspect > targetAspect + 0.01) {
          scaleX = currentAspect / targetAspect;
        } else if (currentAspect < targetAspect - 0.01) {
          scaleY = targetAspect / currentAspect;
        }
      }

      // layers arrive back-to-front
      layers.forEach((l, i) => {
        const img = imgs[i];
        if (!img) return;
        const t = l.transform;
        const w = ((l.width * t.scale) / 100) * scaleX;
        const h = ((l.height * t.scale) / 100) * scaleY;
        const f: string[] = [];
        if (!p.lowRes) {
          if (t.hue) f.push(`hue-rotate(${t.hue}deg)`);
          if (t.brightness !== 100) f.push(`brightness(${t.brightness}%)`);
          if (t.contrast !== 100) f.push(`contrast(${t.contrast}%)`);
        }
        ctx.globalAlpha = t.opacity / 100;
        ctx.filter = f.length ? f.join(" ") : "none";
        const fx = { cropT: 0, cropR: 0, cropB: 0, cropL: 0, flipX: false, flipY: false, blend: "normal", ...(l.fx ?? {}) };
        const iw = img.naturalWidth || l.width;
        const ih = img.naturalHeight || l.height;
        const vw = Math.max(0.01, 1 - (fx.cropL + fx.cropR) / 100);
        const vh = Math.max(0.01, 1 - (fx.cropT + fx.cropB) / 100);
        ctx.globalCompositeOperation = (fx.blend && fx.blend !== "normal" ? fx.blend : "source-over") as GlobalCompositeOperation;
        ctx.save();
        ctx.translate(W / 2 + t.x * scaleX, H / 2 + t.y * scaleY);
        ctx.scale(fx.flipX ? -1 : 1, fx.flipY ? -1 : 1);
        ctx.drawImage(
          img,
          (iw * fx.cropL) / 100,
          (ih * fx.cropT) / 100,
          iw * vw,
          ih * vh,
          -w / 2 + (w * fx.cropL) / 100,
          -h / 2 + (h * fx.cropT) / 100,
          w * vw,
          h * vh,
        );
        ctx.restore();
        ctx.globalCompositeOperation = "source-over";
      });
    });
  }, [p]);

  const isChroma = Boolean(
    p?.state.transform?.chromaCycle ||
    p?.state.scene?.some((l) => l.transform?.chromaCycle)
  );
  const chromaDuration = p?.state.transform?.chromaSpeed || 6;
  const shouldAnimate = isChroma && Boolean(p?.visible);

  // Smooth real-time rainbow hue-cycle animation directly on the canvas element
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!shouldAnimate) {
      c.style.filter = "";
      return;
    }
    let raf: number;
    const start = performance.now();
    const periodMs = (chromaDuration || 6) * 1000;
    const tick = (now: number) => {
      const deg = (((now - start) % periodMs) / periodMs) * 360;
      c.style.filter = `hue-rotate(${deg.toFixed(1)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      c.style.filter = "";
    };
  }, [shouldAnimate, chromaDuration]);

  return (
    <canvas
      ref={canvas}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
