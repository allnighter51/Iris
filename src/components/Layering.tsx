import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import {
  ALL_RES,
  RES_GROUPS,
  fxOf,
  type CanvasRes,
  type CompositePreset,
  type Layer,
  type LayerFx,
  type MonitorInfo,
  type Settings,
  type VaultData,
  type VaultItem,
} from "../types";
import { layerBox, snapBox, uid, withZ, type Box } from "../layers";
import { clamp, monitorLabel } from "../util";
import { LayerDrawer } from "./LayerDrawer";
import { LayerPanel } from "./LayerPanel";
import { REF_OPTIONS, SceneImages, type RefKey } from "./SceneView";
import { Modal } from "./ui";

interface Props {
  vault: VaultData;
  setVault: (v: VaultData) => void;
  layers: Layer[];
  setLayers: (f: (l: Layer[]) => Layer[]) => void;
  addLayer: (item: VaultItem, at?: { x: number; y: number }) => string;
  live: boolean;
  setLive: (v: boolean) => void;
  push: () => void;
  monitors: MonitorInfo[];
  monitor: number;
  setMonitor: (i: number) => void;
  settings: Settings;
  activePresetId: string | null;
  setActivePresetId: (id: string | null) => void;
  loadPreset: (p: CompositePreset, push: boolean) => void;
  /** authoring canvas resolution; null = match the monitor */
  canvasRes: CanvasRes | null;
  setCanvasRes: (r: CanvasRes | null) => void;
}

type Drag =
  | {
      mode: "move";
      id: string;
      px: number;
      py: number;
      starts: { id: string; x: number; y: number }[];
      box: Box;
      others: Box[];
    }
  | { mode: "resize"; id: string; hx: number; ax: number; ay: number; cx: number; cy: number; scale: number; visW: number }
  | { mode: "crop"; id: string; edges: string }
  | null;

const SNAP_PX = 8;

/** Crop in *visual* space (what the user sees after flipping) <-> stored source-space crop. */
const visCrop = (fx: LayerFx) => ({
  L: fx.flipX ? fx.cropR : fx.cropL,
  R: fx.flipX ? fx.cropL : fx.cropR,
  T: fx.flipY ? fx.cropB : fx.cropT,
  B: fx.flipY ? fx.cropT : fx.cropB,
});
const fromVis = (fx: LayerFx, v: { L: number; R: number; T: number; B: number }): Partial<LayerFx> => ({
  cropL: fx.flipX ? v.R : v.L,
  cropR: fx.flipX ? v.L : v.R,
  cropT: fx.flipY ? v.B : v.T,
  cropB: fx.flipY ? v.T : v.B,
});

const resKey = (r: CanvasRes | null) => (r ? `${r.w}x${r.h}` : "auto");
const aspectTag = (w: number, h: number) => {
  const a = w / h;
  if (Math.abs(a - 16 / 9) < 0.03) return "16:9";
  if (Math.abs(a - 21 / 9) < 0.12) return "21:9";
  if (Math.abs(a - 16 / 10) < 0.03) return "16:10";
  if (Math.abs(a - 4 / 3) < 0.03) return "4:3";
  return `${a.toFixed(2)}:1`;
};

export function Layering(p: Props) {
  const { vault, layers, setLayers, monitors, canvasRes } = p;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"fit" | 50 | 100>("fit");
  const [ref, setRef] = useState<RefKey>("grid");
  const [customShot, setCustomShot] = useState<string | null>(() => localStorage.getItem("iris_custom_ref_shot"));
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });
  const [saveOpen, setSaveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tool, setTool] = useState<"move" | "crop">("move");
  const [snapOn, setSnapOn] = useState(true);
  const [grid10, setGrid10] = useState(false);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [chopPct, setChopPct] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const customInput = useRef<HTMLInputElement>(null);

  const mon = monitors[p.monitor] ?? monitors[0];
  const W = canvasRes?.w ?? mon?.width ?? 1920;
  const H = canvasRes?.h ?? mon?.height ?? 1080;
  const items = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);
  const sel = layers.find((l) => l.id === selectedId) ?? null;
  const activePreset = vault.presets.find((x) => x.id === p.activePresetId) ?? null;

  const update = useCallback(
    (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    [setLayers],
  );
  const updateFx = useCallback(
    (id: string, patch: Partial<LayerFx>) =>
      setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, fx: { ...fxOf(l), ...patch } } : l))),
    [setLayers],
  );

  /** Move a layer plus every unlocked layer linked to it by the same group. */
  const shiftLayers = useCallback(
    (id: string, dx: number, dy: number) =>
      setLayers((ls) => {
        const src = ls.find((l) => l.id === id);
        const g = src ? fxOf(src).group : null;
        return ls.map((l) =>
          (l.id === id || (g && fxOf(l).group === g)) && !l.locked ? { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) } : l,
        );
      }),
    [setLayers],
  );

  const duplicate = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    const copy: Layer = {
      ...src,
      id: uid(),
      name: src.name + " copy",
      x: src.x + 20,
      y: src.y + 20,
      locked: false,
      fx: { ...fxOf(src), group: null },
    };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      return i < 0 ? ls : [...ls.slice(0, i), copy, ...ls.slice(i)];
    });
    setSelectedId(copy.id);
  };
  const remove = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (soloId === id) setSoloId(null);
  };

  const boxOf = (l: Layer): Box | null => {
    const it = items.get(l.vaultItemId);
    return it ? layerBox(l, it.width, it.height) : null;
  };
  const toMonitor = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    const k = r.width / W;
    return { mx: (cx - r.left) / k, my: (cy - r.top) / k, k };
  };

  /** Photoshop-style chop: split the selected layer into two non-destructive crops. */
  function chop(axis: "v" | "h") {
    if (!sel || sel.locked) return;
    const fx = fxOf(sel);
    const v = visCrop(fx);
    const f = clamp(chopPct, 5, 95) / 100;
    const a = { ...v };
    const b = { ...v };
    let nameA: string;
    let nameB: string;
    if (axis === "v") {
      const m = v.L + (100 - v.L - v.R) * f;
      a.R = Math.round((100 - m) * 10) / 10;
      b.L = Math.round(m * 10) / 10;
      nameA = " (left)";
      nameB = " (right)";
    } else {
      const m = v.T + (100 - v.T - v.B) * f;
      a.B = Math.round((100 - m) * 10) / 10;
      b.T = Math.round(m * 10) / 10;
      nameA = " (top)";
      nameB = " (bottom)";
    }
    const base = sel.name.replace(/ \((left|right|top|bottom)\)$/, "");
    const copy: Layer = { ...sel, id: uid(), name: base + nameB, fx: { ...fx, ...fromVis(fx, b) } };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === sel.id);
      if (i < 0) return ls;
      const first: Layer = { ...ls[i], name: base + nameA, fx: { ...fx, ...fromVis(fx, a) } };
      return [...ls.slice(0, i), copy, first, ...ls.slice(i + 1)];
    });
    setSelectedId(copy.id);
  }

  function align(kind: "l" | "cx" | "r" | "t" | "cy" | "b") {
    if (!sel || sel.locked) return;
    const b = boxOf(sel);
    if (!b) return;
    let dx = 0;
    let dy = 0;
    if (kind === "l") dx = -W / 2 - b.l;
    if (kind === "cx") dx = -(b.l + b.w / 2);
    if (kind === "r") dx = W / 2 - (b.l + b.w);
    if (kind === "t") dy = -H / 2 - b.t;
    if (kind === "cy") dy = -(b.t + b.h / 2);
    if (kind === "b") dy = H / 2 - (b.t + b.h);
    shiftLayers(sel.id, dx, dy);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const { mx, my } = toMonitor(e.clientX, e.clientY);
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle;
    const cropEdges = target.dataset.crop;
    if (cropEdges && sel && !sel.locked) {
      stage.current!.setPointerCapture(e.pointerId);
      drag.current = { mode: "crop", id: sel.id, edges: cropEdges };
      return;
    }
    if (handle && sel && !sel.locked) {
      const b = boxOf(sel)!;
      const [hx] = handle.split(",").map(Number);
      stage.current!.setPointerCapture(e.pointerId);
      const [, hy] = handle.split(",").map(Number);
      drag.current = {
        mode: "resize",
        id: sel.id,
        hx,
        ax: hx < 0 ? b.l + b.w : b.l,
        ay: hy < 0 ? b.t + b.h : b.t,
        cx: sel.x,
        cy: sel.y,
        scale: sel.scale,
        visW: b.w,
      };
      return;
    }
    const hit = layers.find((l) => {
      const b = boxOf(l);
      if (!l.visible || !b) return false;
      const cx = mx - W / 2;
      const cy = my - H / 2;
      return cx >= b.l && cx <= b.l + b.w && cy >= b.t && cy <= b.t + b.h;
    });
    setSelectedId(hit?.id ?? null);
    if (hit && !hit.locked) {
      const g = fxOf(hit).group;
      const members = layers.filter((l) => l.id === hit.id || (g && fxOf(l).group === g)).filter((l) => !l.locked);
      const moving = new Set(members.map((m) => m.id));
      stage.current!.setPointerCapture(e.pointerId);
      drag.current = {
        mode: "move",
        id: hit.id,
        px: mx,
        py: my,
        starts: members.map((m) => ({ id: m.id, x: m.x, y: m.y })),
        box: boxOf(hit)!,
        others: layers.filter((l) => l.visible && !moving.has(l.id)).map(boxOf).filter((b): b is Box => !!b),
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { mx, my, k } = toMonitor(e.clientX, e.clientY);
    if (d.mode === "move") {
      let dx = mx - d.px;
      let dy = my - d.py;
      let xs: number[] = [];
      let ys: number[] = [];
      const useGrid = grid10 || e.shiftKey;
      if (!e.altKey && (snapOn || useGrid)) {
        const moved: Box = { ...d.box, l: d.box.l + dx, t: d.box.t + dy };
        const s = snapBox(moved, W, H, snapOn ? d.others : [], snapOn ? SNAP_PX / k : 0, useGrid ? 10 : 0);
        dx += s.dx;
        dy += s.dy;
        xs = s.xs;
        ys = s.ys;
      }
      setGuides({ xs, ys });
      const byId = new Map(d.starts.map((s) => [s.id, s]));
      setLayers((ls) =>
        ls.map((l) => {
          const s = byId.get(l.id);
          return s ? { ...l, x: Math.round(s.x + dx), y: Math.round(s.y + dy) } : l;
        }),
      );
    } else if (d.mode === "resize") {
      const newW = (mx - W / 2 - d.ax) * d.hx;
      const scale = clamp(d.scale * (newW / d.visW), 5, 400);
      const r = scale / d.scale;
      update(d.id, {
        scale: Math.round(scale * 10) / 10,
        x: Math.round(d.ax + (d.cx - d.ax) * r),
        y: Math.round(d.ay + (d.cy - d.ay) * r),
      });
    } else {
      const l = layers.find((x) => x.id === d.id);
      const it = l && items.get(l.vaultItemId);
      if (!l || !it) return;
      const fx = fxOf(l);
      const lw = (it.width * l.scale) / 100;
      const lh = (it.height * l.scale) / 100;
      const px = ((mx - (W / 2 + l.x - lw / 2)) / lw) * 100;
      const py = ((my - (H / 2 + l.y - lh / 2)) / lh) * 100;
      const v = visCrop(fx);
      const rd = (n: number) => Math.round(n * 10) / 10;
      if (d.edges.includes("l")) v.L = rd(clamp(px, 0, 98 - v.R));
      if (d.edges.includes("r")) v.R = rd(clamp(100 - px, 0, 98 - v.L));
      if (d.edges.includes("t")) v.T = rd(clamp(py, 0, 98 - v.B));
      if (d.edges.includes("b")) v.B = rd(clamp(100 - py, 0, 98 - v.T));
      updateFx(l.id, fromVis(fx, v));
    }
  }
  const endDrag = () => {
    drag.current = null;
    setGuides({ xs: [], ys: [] });
  };

  // Keyboard: arrows nudge (Shift = 10px), Ctrl+D duplicate, Delete removes, C toggles crop tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!sel || saveOpen || exportOpen || importOpen) return;
      const n = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-n, 0],
        ArrowRight: [n, 0],
        ArrowUp: [0, -n],
        ArrowDown: [0, n],
      };
      if (arrows[e.key]) {
        e.preventDefault();
        shiftLayers(sel.id, arrows[e.key][0], arrows[e.key][1]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(sel.id);
      } else if (e.key === "Delete" && !sel.locked) {
        remove(sel.id);
      } else if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey) {
        setTool((t0) => (t0 === "crop" ? "move" : "crop"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, layers, saveOpen, exportOpen, importOpen]);

  function handleCustomScreenshot(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) {
        setCustomShot(res);
        try {
          localStorage.setItem("iris_custom_ref_shot", res);
        } catch {
          // localStorage quota exceeded, keep in memory
        }
        setRef("custom");
      }
    };
    reader.readAsDataURL(f);
  }

  const cycleRes = (dir: 1 | -1) => {
    const list: (CanvasRes | null)[] = [null, ...ALL_RES.map((r) => ({ w: r.w, h: r.h }))];
    const cur = list.findIndex((r) => resKey(r) === resKey(canvasRes));
    const next = list[(((cur < 0 ? 0 : cur) + dir) % list.length + list.length) % list.length];
    p.setCanvasRes(next);
  };

  const stageWidth = zoom === "fit" ? "100%" : `${(W * zoom) / 100}px`;

  const bgImage = ref === "custom" && customShot ? `url(${customShot})` : undefined;

  const previewLayers = soloId ? layers.map((l) => (l.id === soloId ? { ...l, visible: true } : { ...l, visible: false })) : layers;
  const selBox = sel && sel.visible ? boxOf(sel) : null;
  const selFx = sel ? fxOf(sel) : null;
  const cropped = !!selFx && (selFx.cropT || selFx.cropR || selFx.cropB || selFx.cropL);
  const pct = (n: number, total: number) => `${(n / total) * 100}%`;

  return (
    <div className="layering">
      <input
        ref={customInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => handleCustomScreenshot(e.target.files?.[0])}
      />
      <PresetBar
        {...p}
        onSave={() => setSaveOpen(true)}
        onExport={() => setExportOpen(true)}
        onImport={() => setImportOpen(true)}
        clear={() => { setLayers(() => []); p.setActivePresetId(null); setSelectedId(null); setSoloId(null); }}
      />
      <div className="studio">
        <LayerDrawer vault={vault} onAdd={(it) => setSelectedId(p.addLayer(it))} />

        <section className="center-col">
          <div className="viewport-scroll">
            <div
              ref={stage}
              className={`stage lstage bracket bd-${ref === "grid" ? "grid" : "ref"}`}
              style={{
                width: stageWidth,
                aspectRatio: `${W} / ${H}`,
                backgroundImage: bgImage,
                backgroundSize: "100% 100%",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDragOver={(e) => e.dataTransfer.types.includes("application/x-iris-item") && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("application/x-iris-item");
                const it = items.get(id);
                if (!it) return;
                e.preventDefault();
                const { mx, my } = toMonitor(e.clientX, e.clientY);
                setSelectedId(p.addLayer(it, { x: Math.round(mx - W / 2), y: Math.round(my - H / 2) }));
              }}
            >
              {ref === "custom" && !customShot && (
                <div className="empty-ref-prompt" onClick={() => customInput.current?.click()}>
                  <div className="prompt-icon">&#x1F4F7;</div>
                  <div className="prompt-title">No in-game screenshot uploaded</div>
                  <div className="muted small">Click to upload a full-screen screenshot (1080p, 1440p, 4K) from Overwatch 2, Valorant, Marvel Rivals, etc.</div>
                  <button type="button" className="btn small primary prompt-btn">Upload Screenshot</button>
                </div>
              )}
              <SceneImages layers={previewLayers} vault={vault} refW={W} refH={H} />

              {guides.xs.map((x) => <div key={`x${x}`} className="guide v" style={{ left: pct(x, W) }} />)}
              {guides.ys.map((y) => <div key={`y${y}`} className="guide h" style={{ top: pct(y, H) }} />)}

              {sel && selBox && (
                <div
                  className={`lbox${sel.locked ? " locked" : ""}${tool === "crop" ? " cropping" : ""}`}
                  style={{
                    left: pct(W / 2 + selBox.l, W),
                    top: pct(H / 2 + selBox.t, H),
                    width: pct(selBox.w, W),
                    height: pct(selBox.h, H),
                  }}
                >
                  {!sel.locked && tool === "move" &&
                    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([hx, hy]) => (
                      <i key={`${hx}${hy}`} className="hnd" data-handle={`${hx},${hy}`} style={{ left: hx < 0 ? 0 : "100%", top: hy < 0 ? 0 : "100%", cursor: hx === hy ? "nwse-resize" : "nesw-resize" }} />
                    ))}
                  {!sel.locked && tool === "crop" &&
                    ([
                      ["tl", "0%", "0%", "nwse-resize"],
                      ["t", "50%", "0%", "ns-resize"],
                      ["tr", "100%", "0%", "nesw-resize"],
                      ["r", "100%", "50%", "ew-resize"],
                      ["br", "100%", "100%", "nwse-resize"],
                      ["b", "50%", "100%", "ns-resize"],
                      ["bl", "0%", "100%", "nesw-resize"],
                      ["l", "0%", "50%", "ew-resize"],
                    ] as const).map(([edges, left, top, cursor]) => (
                      <i key={edges} className="hnd crop-hnd" data-crop={edges} style={{ left, top, cursor }} />
                    ))}
                  <span className="lbox-tag mono">
                    {sel.name} · {Math.round(sel.x)},{Math.round(sel.y)} · {sel.scale.toFixed(0)}%{cropped ? " · ✂ cropped" : ""}
                  </span>
                </div>
              )}
              <div className="stage-tag mono">
                {canvasRes ? `Canvas ${W}×${H} (${aspectTag(W, H)})` : mon ? monitorLabel(mon) : "Display"}
              </div>
            </div>
          </div>

          <div className="canvas-toolbar card">
            <div className="seg">
              {(["fit", 50, 100] as const).map((z) => (
                <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z === "fit" ? "Fit" : `${z}%`}</button>
              ))}
            </div>
            <select
              className="input"
              value={ref}
              onChange={(e) => {
                const v = e.target.value as RefKey;
                if (v === "custom" && !customShot) customInput.current?.click();
                setRef(v);
              }}
              title="Reference backdrop"
            >
              {REF_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {ref === "custom" && (
              <button
                type="button"
                className="btn small outline"
                onClick={() => customInput.current?.click()}
                title="Upload or change custom in-game screenshot"
              >
                &#x1F4F7; {customShot ? "Change Screenshot" : "Upload Screenshot"}
              </button>
            )}
            <select className="input mon" value={p.monitor} onChange={(e) => p.setMonitor(Number(e.target.value))} title="Target monitor">
              {monitors.map((m) => <option key={m.index} value={m.index}>{monitorLabel(m)}</option>)}
            </select>
            <div className="res-ctl" title="Authoring canvas resolution — pushed overlays auto-scale to your real monitor">
              <button type="button" className="btn small outline num-btn" onClick={() => cycleRes(-1)} aria-label="Previous resolution">◀</button>
              <select
                className="input res-sel"
                value={resKey(canvasRes)}
                onChange={(e) => {
                  if (e.target.value === "auto") return p.setCanvasRes(null);
                  const [w, h] = e.target.value.split("x").map(Number);
                  p.setCanvasRes({ w, h });
                }}
              >
                <option value="auto">Match Monitor{mon ? ` (${mon.width}×${mon.height})` : ""}</option>
                {canvasRes && !ALL_RES.some((r) => r.w === canvasRes.w && r.h === canvasRes.h) && (
                  <option value={resKey(canvasRes)}>Custom {canvasRes.w}×{canvasRes.h}</option>
                )}
                {RES_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((r) => <option key={`${r.w}x${r.h}`} value={`${r.w}x${r.h}`}>{r.label} — {r.w}×{r.h}</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" className="btn small outline num-btn" onClick={() => cycleRes(1)} aria-label="Next resolution">▶</button>
              <span className="tag mono res-tag">{aspectTag(W, H)}</span>
            </div>
            <div className="spacer" />
            {p.live && <span className="mono ok small live-flag">&#x25CF; LIVE SYNC</span>}
            {p.live && <button className="btn outline small" onClick={() => p.setLive(false)}>Stop</button>}
            <button className="btn primary" disabled={!layers.some((l) => l.visible)} onClick={p.push}>
              {p.live ? "Re-push Composite" : "Push Composite to Live Overlay"}
            </button>
          </div>

          <div className="canvas-toolbar tools-bar card">
            <div className="seg" title="Tool (press C to toggle crop)">
              <button className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}>✥ Move</button>
              <button className={tool === "crop" ? "active" : ""} onClick={() => setTool("crop")}>✂ Crop</button>
            </div>
            <div className="tool-group" title="Align the selected layer to the canvas">
              {([["l", "⇤", "Align left"], ["cx", "↔", "Center horizontally"], ["r", "⇥", "Align right"], ["t", "⤒", "Align top"], ["cy", "↕", "Center vertically"], ["b", "⤓", "Align bottom"]] as const).map(([k, g, t]) => (
                <button key={k} className="btn small outline num-btn" disabled={!sel || sel.locked} title={t} onClick={() => align(k)}>{g}</button>
              ))}
            </div>
            <div className="tool-group">
              <button className={`btn small ${selFx?.flipX ? "primary" : "outline"}`} disabled={!sel || sel.locked} title="Flip horizontally" onClick={() => sel && updateFx(sel.id, { flipX: !selFx!.flipX })}>⇋ Flip X</button>
              <button className={`btn small ${selFx?.flipY ? "primary" : "outline"}`} disabled={!sel || sel.locked} title="Flip vertically" onClick={() => sel && updateFx(sel.id, { flipY: !selFx!.flipY })}>⇅ Flip Y</button>
            </div>
            <div className="tool-group" title="Chop the selected layer into two independent pieces (non-destructive)">
              <span className="mono small muted">Chop @</span>
              <input
                className="input chop-pct"
                type="number"
                min={5}
                max={95}
                value={chopPct}
                onChange={(e) => setChopPct(Number(e.target.value) || 50)}
              />
              <span className="mono small muted">%</span>
              <button className="btn small outline" disabled={!sel || sel.locked} onClick={() => chop("v")}>┃ Vertical</button>
              <button className="btn small outline" disabled={!sel || sel.locked} onClick={() => chop("h")}>━ Horizontal</button>
            </div>
            <div className="spacer" />
            <button className={`btn small ${soloId ? "primary" : "outline"}`} disabled={!sel && !soloId} title="Show only the selected layer in the editor" onClick={() => setSoloId(soloId ? null : selectedId)}>
              {soloId ? "◉ Solo On" : "○ Solo"}
            </button>
            <button className={`btn small ${snapOn ? "primary" : "outline"}`} title="Smart guides: snap to canvas and other layers (hold Alt to bypass)" onClick={() => setSnapOn(!snapOn)}>
              {snapOn ? "✓ Smart Snap" : "Snap Off"}
            </button>
            <button className={`btn small ${grid10 ? "primary" : "outline"}`} title="Move in 10px steps (or hold Shift)" onClick={() => setGrid10(!grid10)}>
              {grid10 ? "✓ 10px Grid" : "10px Grid"}
            </button>
          </div>
          <div className="muted small tips">
            Drag to move · corner handles scale · <b>C</b> crop tool · arrows nudge 1px (<b>Shift</b> 10px) · <b>Ctrl+D</b> duplicate · <b>Del</b> delete · hold <b>Alt</b> to bypass snapping · drop Vault items onto the canvas.
          </div>
        </section>

        <LayerPanel
          vault={vault}
          layers={layers}
          setLayers={setLayers}
          selectedId={selectedId}
          select={setSelectedId}
          update={update}
          updateFx={updateFx}
          duplicate={duplicate}
          remove={remove}
          roleHotkeys={p.settings.layerHotkeys}
        />
      </div>

      {saveOpen && (
        <SavePresetModal
          vault={vault}
          layers={layers}
          active={activePreset}
          refW={W}
          refH={H}
          onClose={() => setSaveOpen(false)}
          onSaved={(v, id) => {
            p.setVault(v);
            p.setActivePresetId(id);
            setSaveOpen(false);
          }}
        />
      )}

      {exportOpen && (
        <ExportPresetModal
          layers={layers}
          active={activePreset}
          vault={vault}
          refW={W}
          refH={H}
          onClose={() => setExportOpen(false)}
        />
      )}

      {importOpen && (
        <ImportPresetModal
          vault={vault}
          onImport={(importedLayers, meta) => {
            setLayers(() => importedLayers);
            p.setActivePresetId(null);
            setSelectedId(importedLayers[0]?.id ?? null);
            if (meta.refW && meta.refH) p.setCanvasRes({ w: meta.refW, h: meta.refH });
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function PresetBar(p: Props & { onSave: () => void; onExport: () => void; onImport: () => void; clear: () => void }) {
  const active = p.vault.presets.find((x) => x.id === p.activePresetId) ?? null;
  return (
    <div className="presetbar card bracket">
      <span className="mono small muted">LOADOUT</span>
      <select
        className="input preset-sel"
        value={p.activePresetId ?? ""}
        onChange={(e) => {
          const pr = p.vault.presets.find((x) => x.id === e.target.value);
          if (pr) p.loadPreset(pr, false);
          else p.setActivePresetId(null);
        }}
      >
        <option value="">— Unsaved stack —</option>
        {p.vault.presets.map((x) => <option key={x.id} value={x.id}>{x.name}{x.inVault ? "  ▣ STACK" : ""}</option>)}
      </select>
      {active?.inVault && <span className="stack-badge mono">STACK</span>}
      <div className="spacer" />
      <button className="btn outline small" onClick={p.onImport} title="Import a preset share code or .irispack file">📥 Import Preset</button>
      <button className="btn outline small" onClick={p.onExport} disabled={!p.layers.length} title="Export this loadout as a share code or .irispack file">📤 Share Preset</button>
      <button className="btn outline small" onClick={p.clear} disabled={!p.layers.length}>Clear Stack</button>
      {active && (
        <>
          <button
            className="btn outline small"
            onClick={async () => p.setVault(await api.savePreset({ ...active, inVault: !active.inVault }))}
            title="Show this loadout in the Vault tab with a STACK badge"
          >
            {active.inVault ? "Unpin from Vault" : "Pin to Vault"}
          </button>
          <button
            className="btn outline small danger-o"
            onClick={async () => {
              p.setVault(await api.deletePreset(active.id));
              p.setActivePresetId(null);
            }}
          >
            Delete
          </button>
        </>
      )}
      <button className="btn primary small" disabled={!p.layers.length} onClick={p.onSave}>Save Layer Preset</button>
    </div>
  );
}

function SavePresetModal({ vault, layers, active, refW, refH, onClose, onSaved }: {
  vault: VaultData;
  layers: Layer[];
  active: CompositePreset | null;
  refW: number;
  refH: number;
  onClose: () => void;
  onSaved: (v: VaultData, id: string) => void;
}) {
  const [name, setName] = useState(active?.name ?? "");
  const [inVault, setInVault] = useState(active?.inVault ?? true);
  const [asNew, setAsNew] = useState(false);
  const overwrite = !!active && !asNew;

  async function save() {
    const first = vault.items.find((i) => i.id === layers[0]?.vaultItemId);
    const preset: CompositePreset = {
      id: overwrite ? active!.id : uid(),
      name: name.trim(),
      game: first?.game ?? null,
      layers: withZ(layers),
      refW,
      refH,
      inVault,
      createdAt: overwrite ? active!.createdAt : Date.now(),
    };
    onSaved(await api.savePreset(preset), preset.id);
  }

  return (
    <Modal title="Save Layer Preset" onClose={onClose} width={460}>
      <label className="label">Loadout name</label>
      <input className="input full" autoFocus value={name} placeholder='e.g. "Valo Viper Map + HUD"' onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && save()} />
      <label className="check"><input type="checkbox" checked={inVault} onChange={(e) => setInVault(e.target.checked)} /> Show in Vault with a <span className="stack-badge mono">STACK</span> badge</label>
      {active && <label className="check"><input type="checkbox" checked={asNew} onChange={(e) => setAsNew(e.target.checked)} /> Save as a new preset (keep "{active.name}" unchanged)</label>}
      <p className="muted small">Saves {layers.length} layers: references, z-order, position, scale, opacity, hue, visibility and locks.</p>
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={save}>{overwrite ? "Update Preset" : "Save Preset"}</button>
      </div>
    </Modal>
  );
}

function ExportPresetModal({
  layers,
  active,
  vault,
  refW,
  refH,
  onClose,
}: {
  layers: Layer[];
  active: CompositePreset | null;
  vault: VaultData;
  refW: number;
  refH: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const items = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);

  const presetData = useMemo(() => {
    return {
      irisVersion: "1.0",
      type: "preset",
      name: active?.name || "Custom Loadout",
      game: active?.game || items.get(layers[0]?.vaultItemId)?.game || "Other",
      refW,
      refH,
      createdAt: Date.now(),
      layers: layers.map((l) => ({
        name: l.name,
        role: l.role,
        zIndex: l.zIndex,
        visible: l.visible,
        locked: l.locked,
        x: l.x,
        y: l.y,
        scale: l.scale,
        opacity: l.opacity,
        hue: l.hue,
        fx: fxOf(l),
        vaultItemId: l.vaultItemId,
        assetFile: items.get(l.vaultItemId)?.file,
        assetName: items.get(l.vaultItemId)?.name,
        game: items.get(l.vaultItemId)?.game,
      })),
    };
  }, [layers, active, items, refW, refH]);

  const jsonString = useMemo(() => JSON.stringify(presetData, null, 2), [presetData]);
  const shareCode = useMemo(() => {
    try {
      return `IRIS-PRESET:${btoa(unescape(encodeURIComponent(JSON.stringify(presetData))))}`;
    } catch {
      return `IRIS-PRESET:${btoa(JSON.stringify(presetData))}`;
    }
  }, [presetData]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadFile = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (presetData.name || "loadout").toLowerCase().replace(/[^a-z0-9]/g, "_");
    a.download = `${safeName}.irispack`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title="Share / Export Preset" onClose={onClose} width={520}>
      <p className="muted small">
        Share your exact multi-element HUD layout with friends, Discord communities, or Venus Visuals.
      </p>
      <label className="label">Preset Share Code (One-Click Copy)</label>
      <textarea
        className="share-code-box"
        readOnly
        value={shareCode}
        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
      />
      <div className="share-actions-row">
        <button className="btn primary grow" onClick={copyCode}>
          {copied ? "✓ Copied to Clipboard!" : "Copy Share Code"}
        </button>
        <button className="btn outline" onClick={downloadFile} title="Download as .irispack file">
          Download .irispack File
        </button>
      </div>
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function ImportPresetModal({
  vault,
  onImport,
  onClose,
}: {
  vault: VaultData;
  onImport: (presetLayers: Layer[], presetMeta: { name: string; game: string | null; refW: number; refH: number }) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleProcess = (rawText: string) => {
    setError("");
    let parsed: any = null;
    let trimmed = rawText.trim();
    if (trimmed.startsWith("IRIS-PRESET:")) {
      trimmed = trimmed.slice("IRIS-PRESET:".length).trim();
      try {
        const decoded = decodeURIComponent(escape(atob(trimmed)));
        parsed = JSON.parse(decoded);
      } catch {
        try {
          parsed = JSON.parse(atob(trimmed));
        } catch {
          setError("Invalid IRIS-PRESET share code format.");
          return;
        }
      }
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        setError("Invalid JSON or share code format.");
        return;
      }
    }

    if (!parsed || !Array.isArray(parsed.layers)) {
      setError("Parsed preset does not contain a valid layers array.");
      return;
    }

    const items = vault.items;
    const reconstructed: Layer[] = parsed.layers.map((l: any, idx: number) => {
      let matched = items.find((i) => i.id === l.vaultItemId);
      if (!matched && l.assetFile) matched = items.find((i) => i.file === l.assetFile);
      if (!matched && l.assetName) matched = items.find((i) => i.name.toLowerCase() === l.assetName.toLowerCase());
      if (!matched) matched = items[0];

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

    onImport(reconstructed, {
      name: parsed.name || "Imported Loadout",
      game: parsed.game || null,
      refW: parsed.refW || 1920,
      refH: parsed.refH || 1080,
    });
    onClose();
  };

  const handleFileUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") handleProcess(reader.result);
    };
    reader.readAsText(file);
  };

  return (
    <Modal title="Import Layer Preset" onClose={onClose} width={500}>
      <p className="muted small">
        Paste a preset share code (`IRIS-PRESET:...`) or upload a `.irispack` / `.iris` JSON file.
      </p>
      <label className="label">Paste Share Code or JSON</label>
      <textarea
        className="share-code-box"
        placeholder="IRIS-PRESET:eyJ2ZXJzaW9uIjoxLC..."
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <div className="error">{error}</div>}
      <div className="share-actions-row">
        <label className="btn outline grow" style={{ textAlign: "center", cursor: "pointer" }}>
          📁 Browse .irispack File
          <input
            type="file"
            accept=".irispack,.iris,.json"
            hidden
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />
        </label>
        <button className="btn primary grow" disabled={!code.trim()} onClick={() => handleProcess(code)}>
          Load into Workspace
        </button>
      </div>
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}