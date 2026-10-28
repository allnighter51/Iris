import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, assetUrl } from "../api";
import {
  ALL_RES, ELEMENT_TAGS, GAMES, RES_GROUPS, fxOf,
  type CanvasRes, type CompositePreset, type Layer, type LayerFx,
  type MonitorInfo, type Settings, type VaultData, type VaultItem,
} from "../types";
import { layerBox, parsePresetPayload, snapBox, uid, withZ, type Box } from "../layers";
import { clamp, gameClass, monitorLabel, resolutionTag } from "../util";
import { LayerStack, LayerInspector } from "./LayerPanel";
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
  canvasRes: CanvasRes | null;
  setCanvasRes: (r: CanvasRes | null) => void;
}

type Drag =
  | { mode: "move"; id: string; px: number; py: number; starts: { id: string; x: number; y: number }[]; box: Box; others: Box[] }
  | { mode: "resize"; id: string; hx: number; ax: number; ay: number; cx: number; cy: number; scale: number; visW: number }
  | { mode: "crop"; id: string; edges: string }
  | null;

type ZoomLevel = "fit" | 50 | 75 | 100 | 150 | 200;

const SNAP_PX = 8;
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
  </svg>
);
const LockIcon = ({ open }: { open?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d={open ? "M5.5 7V5a2.5 2.5 0 015 0" : "M5 7V5a3 3 0 016 0v2"} />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 7v4M9.5 7v4" />
  </svg>
);

function LayerDrawer({ vault, onAdd }: { vault: VaultData; onAdd: (item: VaultItem) => void }) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("All");
  const [tag, setTag] = useState("all");

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vault.items
      .filter((i) => (game === "All" || i.game === game) && (tag === "all" || i.tag === tag) && (!s || i.name.toLowerCase().includes(s)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [vault.items, q, game, tag]);

  return (
    <aside className="drawer card bracket workbench-col">
      <div className="panel-title"><span>Vault Drawer</span><span className="mono muted small">{items.length}</span></div>
      <input className="input full" placeholder="Search elements..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="drawer-filters">
        <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
          {["All", ...GAMES].map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All elements</option>
          {ELEMENT_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="drawer-grid">
        {items.map((item) => (
          <div
            key={item.id}
            className="mini"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("application/x-iris-item", item.id); e.dataTransfer.effectAllowed = "copy"; }}
            onDoubleClick={() => onAdd(item)}
            title="Drag onto the canvas, or double-click to add"
          >
            <div className="checker mini-thumb">
              <img draggable={false} loading="lazy" src={assetUrl(item.thumb ? vault.thumbsDir : vault.assetsDir, item.thumb ?? item.file)} alt="" />
              <span className="mono mini-res">{resolutionTag(item.width, item.height)}</span>
            </div>
            <div className="mini-name">{item.name}</div>
            <div className="mini-row">
              <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
              {item.tag && <span className="chip folder">{ELEMENT_TAGS.find((t) => t.id === item.tag)?.label ?? item.tag}</span>}
            </div>
            <button className="btn small outline add" onClick={() => onAdd(item)}>+ Add as Layer</button>
          </div>
        ))}
        {!items.length && <div className="muted small empty-note">No matching elements. Upload PNGs in the Vault and tag them (Ult Icon, Minimap…).</div>}
      </div>
    </aside>
  );
}

export function Layering(p: Props) {
  const { vault, layers, setLayers, monitors, canvasRes } = p;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>("fit");
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [ref, setRef] = useState<RefKey>("grid");
  const [customShot, setCustomShot] = useState<string | null>(() => localStorage.getItem("iris_custom_ref_shot"));
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });
  const [saveOpen, setSaveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tool, setTool] = useState<"move" | "crop">("move");
  const [snapOn, setSnapOn] = useState(true);
  const [grid10, setGrid10] = useState(false);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [chopPct, setChopPct] = useState(50);

  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number }>({ x: 0, y: 0, px: 0, py: 0 });

  // 50-step History Stack
  const [history, setHistory] = useState<Layer[][]>(() => [layers]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const historyIdxRef = useRef(0);
  historyIdxRef.current = historyIdx;
  const isUndoRedoAction = useRef(false);
  const isDraggingRef = useRef(false);
  const initialDragLayers = useRef<Layer[] | null>(null);
  const clipboardRef = useRef<Layer[] | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const selectedId = selectedIds[selectedIds.length - 1] ?? null;
  const mon = monitors[p.monitor] ?? monitors[0];
  const W = canvasRes?.w ?? mon?.width ?? 1920;
  const H = canvasRes?.h ?? mon?.height ?? 1080;
  const items = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);
  const sel = layers.find((l) => l.id === selectedId) ?? null;
  const activePreset = vault.presets.find((x) => x.id === p.activePresetId) ?? null;

  // Push completed snapshot to history
  const commitHistory = useCallback((nextLayers: Layer[]) => {
    setHistory((h) => {
      const sliced = h.slice(0, historyIdxRef.current + 1);
      const updated = [...sliced, nextLayers];
      if (updated.length > 50) updated.shift();
      return updated;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 49));
  }, []);

  // Sync outside/interactive changes with history (avoiding drag frames)
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    if (isDraggingRef.current) {
      return;
    }
    setHistory((h) => {
      const cur = h[historyIdxRef.current];
      if (cur && JSON.stringify(cur) === JSON.stringify(layers)) {
        return h;
      }
      const sliced = h.slice(0, historyIdxRef.current + 1);
      const updated = [...sliced, layers];
      if (updated.length > 50) updated.shift();
      return updated;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 49));
  }, [layers]);

  // Clean stale selection ids
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = prev.filter((id) => layers.some((l) => l.id === id));
      return valid.length === prev.length ? prev : valid;
    });
  }, [layers]);

  const undo = useCallback(() => {
    if (historyIdxRef.current > 0) {
      const nextIdx = historyIdxRef.current - 1;
      const target = history[nextIdx];
      if (target) {
        isUndoRedoAction.current = true;
        setHistoryIdx(nextIdx);
        setLayers(() => target);
      }
    }
  }, [history, setLayers]);

  const redo = useCallback(() => {
    if (historyIdxRef.current < history.length - 1) {
      const nextIdx = historyIdxRef.current + 1;
      const target = history[nextIdx];
      if (target) {
        isUndoRedoAction.current = true;
        setHistoryIdx(nextIdx);
        setLayers(() => target);
      }
    }
  }, [history, setLayers]);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const selectLayer = useCallback((id: string | null, multi = false) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    if (multi) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
    }
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    [setLayers],
  );
  const updateFx = useCallback(
    (id: string, patch: Partial<LayerFx>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, fx: { ...fxOf(l), ...patch } } : l))),
    [setLayers],
  );

  const duplicateSingle = useCallback((id: string) => {
    const src = layersRef.current.find((l) => l.id === id);
    if (!src) return;
    const copy: Layer = { ...src, id: uid(), name: `${src.name} copy`, x: src.x + 20, y: src.y + 20, locked: false, fx: { ...fxOf(src), group: null } };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      return i < 0 ? [copy, ...ls] : [...ls.slice(0, i), copy, ...ls.slice(i)];
    });
    setSelectedIds([copy.id]);
  }, [setLayers]);

  const duplicateSelected = useCallback(() => {
    const current = layersRef.current;
    const targets = current.filter((l) => selectedIds.includes(l.id));
    const toDup = targets.length > 0 ? targets : (sel ? [sel] : []);
    if (!toDup.length) return;
    const copies: Layer[] = toDup.map((src) => ({
      ...src,
      id: uid(),
      name: `${src.name} copy`,
      x: src.x + 20,
      y: src.y + 20,
      locked: false,
      fx: { ...fxOf(src), group: null },
    }));
    const copyIds = copies.map((c) => c.id);
    setLayers((ls) => [...copies, ...ls]);
    setSelectedIds(copyIds);
  }, [selectedIds, sel, setLayers]);

  const removeSingle = useCallback((id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    if (soloId === id) setSoloId(null);
  }, [soloId, setLayers]);

  const deleteSelected = useCallback(() => {
    const targets = new Set(selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []));
    if (!targets.size) return;
    setLayers((ls) => ls.filter((l) => !(targets.has(l.id) && !l.locked)));
    setSelectedIds((prev) => prev.filter((id) => !targets.has(id)));
    if (soloId && targets.has(soloId)) setSoloId(null);
  }, [selectedIds, selectedId, soloId, setLayers]);

  const copyLayers = useCallback(() => {
    const current = layersRef.current;
    const toCopy = current.filter((l) => selectedIds.includes(l.id));
    if (toCopy.length > 0) {
      clipboardRef.current = JSON.parse(JSON.stringify(toCopy));
    } else if (sel) {
      clipboardRef.current = [JSON.parse(JSON.stringify(sel))];
    }
  }, [selectedIds, sel]);

  const pasteLayers = useCallback(() => {
    const itemsToPaste = clipboardRef.current;
    if (!itemsToPaste || !itemsToPaste.length) return;
    const newLayers: Layer[] = itemsToPaste.map((l) => ({
      ...l,
      id: uid(),
      name: l.name.includes("copy") ? l.name : `${l.name} copy`,
      x: l.x + 16,
      y: l.y + 16,
      locked: false,
      fx: { ...fxOf(l), group: null },
    }));
    const newIds = newLayers.map((l) => l.id);
    setLayers((ls) => [...newLayers, ...ls]);
    setSelectedIds(newIds);
  }, [setLayers]);

  // Canva-Style Z-Index manipulation (layers[0] is FRONT/TOP)
  const bringForward = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((ls) => {
      const res = [...ls];
      for (let i = 1; i < res.length; i++) {
        if (selectedIds.includes(res[i].id) && !selectedIds.includes(res[i - 1].id)) {
          const tmp = res[i];
          res[i] = res[i - 1];
          res[i - 1] = tmp;
        }
      }
      return res;
    });
  }, [selectedIds, setLayers]);

  const sendBackward = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((ls) => {
      const res = [...ls];
      for (let i = res.length - 2; i >= 0; i--) {
        if (selectedIds.includes(res[i].id) && !selectedIds.includes(res[i + 1].id)) {
          const tmp = res[i];
          res[i] = res[i + 1];
          res[i + 1] = tmp;
        }
      }
      return res;
    });
  }, [selectedIds, setLayers]);

  const bringToFront = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((ls) => {
      const selected = ls.filter((l) => selectedIds.includes(l.id));
      const rest = ls.filter((l) => !selectedIds.includes(l.id));
      return [...selected, ...rest];
    });
  }, [selectedIds, setLayers]);

  const sendToBack = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((ls) => {
      const selected = ls.filter((l) => selectedIds.includes(l.id));
      const rest = ls.filter((l) => !selectedIds.includes(l.id));
      return [...rest, ...selected];
    });
  }, [selectedIds, setLayers]);

  const cycleSelection = useCallback((backwards = false) => {
    const list = layersRef.current;
    if (!list.length) return;
    const curIdx = list.findIndex((l) => l.id === selectedId);
    let nextIdx = 0;
    if (curIdx >= 0) {
      nextIdx = backwards ? (curIdx - 1 + list.length) % list.length : (curIdx + 1) % list.length;
    }
    const next = list[nextIdx];
    if (next) setSelectedIds([next.id]);
  }, [selectedId]);

  const selectAllUnlocked = useCallback(() => {
    const unlocked = layersRef.current.filter((l) => !l.locked).map((l) => l.id);
    setSelectedIds(unlocked);
  }, []);

  const deselectAll = useCallback(() => {
    if (tool === "crop") {
      setTool("move");
    } else {
      setSelectedIds([]);
    }
  }, [tool]);

  const toggleLockSelected = useCallback(() => {
    const targets = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targets.length) return;
    setLayers((ls) => {
      const anyUnlocked = ls.some((l) => targets.includes(l.id) && !l.locked);
      return ls.map((l) => (targets.includes(l.id) ? { ...l, locked: anyUnlocked } : l));
    });
  }, [selectedIds, selectedId, setLayers]);

  const toggleVisibilitySelected = useCallback(() => {
    const targets = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targets.length) return;
    setLayers((ls) => {
      const anyVisible = ls.some((l) => targets.includes(l.id) && l.visible);
      return ls.map((l) => (targets.includes(l.id) ? { ...l, visible: !anyVisible } : l));
    });
  }, [selectedIds, selectedId, setLayers]);

  const flipHorizontalSelected = useCallback(() => {
    const targets = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targets.length) return;
    setLayers((ls) =>
      ls.map((l) => {
        if (targets.includes(l.id) && !l.locked) {
          const fx = fxOf(l);
          return { ...l, fx: { ...fx, flipX: !fx.flipX } };
        }
        return l;
      }),
    );
  }, [selectedIds, selectedId, setLayers]);

  const flipVerticalSelected = useCallback(() => {
    const targets = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targets.length) return;
    setLayers((ls) =>
      ls.map((l) => {
        if (targets.includes(l.id) && !l.locked) {
          const fx = fxOf(l);
          return { ...l, fx: { ...fx, flipY: !fx.flipY } };
        }
        return l;
      }),
    );
  }, [selectedIds, selectedId, setLayers]);

  const setOpacityForSelected = useCallback((pct: number) => {
    const targets = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targets.length) return;
    setLayers((ls) => ls.map((l) => (targets.includes(l.id) && !l.locked ? { ...l, opacity: pct } : l)));
  }, [selectedIds, selectedId, setLayers]);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    const targets = new Set(selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []));
    if (!targets.size) return;
    setLayers((ls) =>
      ls.map((l) => {
        const g = fxOf(l).group;
        const shouldMove = (targets.has(l.id) || (g && ls.some((o) => targets.has(o.id) && fxOf(o).group === g))) && !l.locked;
        return shouldMove ? { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) } : l;
      }),
    );
  }, [selectedIds, selectedId, setLayers]);

  const stepZoom = useCallback((dir: 1 | -1) => {
    const levels: (50 | 75 | 100 | 150 | 200)[] = [50, 75, 100, 150, 200];
    setZoom((cur) => {
      if (cur === "fit") return dir > 0 ? 100 : 50;
      const idx = levels.indexOf(cur);
      const nextIdx = clamp(idx + dir, 0, levels.length - 1);
      return levels[nextIdx];
    });
  }, []);

  const resetZoomFit = useCallback(() => {
    setZoom("fit");
    setPan({ x: 0, y: 0 });
  }, []);

  const boxOf = (l: Layer): Box | null => {
    const it = items.get(l.vaultItemId);
    return it ? layerBox(l, it.width, it.height) : null;
  };

  const toMonitor = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    const k = r.width / W;
    return { mx: (cx - r.left) / k, my: (cy - r.top) / k, k };
  };

  function chop(axis: "v" | "h") {
    if (!sel || sel.locked) return;
    const fx = fxOf(sel);
    const v = visCrop(fx);
    const f = clamp(chopPct, 5, 95) / 100;
    const a = { ...v }, b = { ...v };
    let nameA: string, nameB: string;
    if (axis === "v") {
      const m = v.L + (100 - v.L - v.R) * f;
      a.R = Math.round((100 - m) * 10) / 10;
      b.L = Math.round(m * 10) / 10;
      nameA = " (left)"; nameB = " (right)";
    } else {
      const m = v.T + (100 - v.T - v.B) * f;
      a.B = Math.round((100 - m) * 10) / 10;
      b.T = Math.round(m * 10) / 10;
      nameA = " (top)"; nameB = " (bottom)";
    }
    const base = sel.name.replace(/ \((left|right|top|bottom)\)$/, "");
    const copy: Layer = { ...sel, id: uid(), name: base + nameB, fx: { ...fx, ...fromVis(fx, b) } };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === sel.id);
      if (i < 0) return ls;
      const first: Layer = { ...ls[i], name: base + nameA, fx: { ...fx, ...fromVis(fx, a) } };
      return [...ls.slice(0, i), copy, first, ...ls.slice(i + 1)];
    });
    setSelectedIds([copy.id]);
  }

  function align(kind: "l" | "cx" | "r" | "t" | "cy" | "b") {
    if (!sel || sel.locked) return;
    const b = boxOf(sel);
    if (!b) return;
    const dx = kind === "l" ? -W / 2 - b.l : kind === "cx" ? -(b.l + b.w / 2) : kind === "r" ? W / 2 - (b.l + b.w) : 0;
    const dy = kind === "t" ? -H / 2 - b.t : kind === "cy" ? -(b.t + b.h / 2) : kind === "b" ? H / 2 - (b.t + b.h) : 0;
    nudgeSelected(dx, dy);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Spacebar or Middle-mouse button pan
    if (e.button === 1 || (e.button === 0 && isSpaceDown)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
      stage.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const { mx, my } = toMonitor(e.clientX, e.clientY);
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle;
    const cropEdges = target.dataset.crop;

    if (cropEdges && sel && !sel.locked) {
      stage.current!.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      initialDragLayers.current = layersRef.current;
      drag.current = { mode: "crop", id: sel.id, edges: cropEdges };
      return;
    }
    if (handle && sel && !sel.locked) {
      const b = boxOf(sel)!;
      const [hx, hy] = handle.split(",").map(Number);
      stage.current!.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      initialDragLayers.current = layersRef.current;
      drag.current = { mode: "resize", id: sel.id, hx, ax: hx < 0 ? b.l + b.w : b.l, ay: hy < 0 ? b.t + b.h : b.t, cx: sel.x, cy: sel.y, scale: sel.scale, visW: b.w };
      return;
    }

    const hit = layers.find((l) => {
      const b = boxOf(l);
      if (!l.visible || !b) return false;
      const cx = mx - W / 2, cy = my - H / 2;
      return cx >= b.l && cx <= b.l + b.w && cy >= b.t && cy <= b.t + b.h;
    });

    if (e.shiftKey) {
      selectLayer(hit?.id ?? null, true);
    } else {
      if (!hit || !selectedIds.includes(hit.id)) {
        selectLayer(hit?.id ?? null, false);
      }
    }

    if (hit && !hit.locked) {
      isDraggingRef.current = true;
      initialDragLayers.current = layersRef.current;
      const effectiveIds = selectedIds.includes(hit.id) && selectedIds.length > 1 ? selectedIds : [hit.id];
      const movingSet = new Set<string>();
      for (const id of effectiveIds) {
        const item = layers.find((l) => l.id === id);
        const g = item ? fxOf(item).group : null;
        for (const l of layers) {
          if ((l.id === id || (g && fxOf(l).group === g)) && !l.locked) {
            movingSet.add(l.id);
          }
        }
      }
      const members = layers.filter((l) => movingSet.has(l.id));
      stage.current!.setPointerCapture(e.pointerId);
      drag.current = {
        mode: "move",
        id: hit.id,
        px: mx,
        py: my,
        starts: members.map((m) => ({ id: m.id, x: m.x, y: m.y })),
        box: boxOf(hit)!,
        others: layers.filter((l) => l.visible && !movingSet.has(l.id)).map(boxOf).filter((b): b is Box => !!b),
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (isPanning) {
      const dx = e.clientX - panStart.current.px;
      const dy = e.clientY - panStart.current.py;
      setPan({ x: Math.round(panStart.current.x + dx), y: Math.round(panStart.current.y + dy) });
      return;
    }

    const d = drag.current;
    if (!d) return;
    const { mx, my, k } = toMonitor(e.clientX, e.clientY);

    if (d.mode === "move") {
      let dx = mx - d.px, dy = my - d.py, xs: number[] = [], ys: number[] = [];
      const useGrid = grid10 || e.shiftKey;
      if (!e.altKey && (snapOn || useGrid)) {
        const moved: Box = { ...d.box, l: d.box.l + dx, t: d.box.t + dy };
        const s = snapBox(moved, W, H, snapOn ? d.others : [], snapOn ? SNAP_PX / k : 0, useGrid ? 10 : 0);
        dx += s.dx; dy += s.dy; xs = s.xs; ys = s.ys;
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
      if (e.altKey) {
        // Alt + Drag: Scale symmetrically from center anchor point
        const curDistX = Math.abs(mx - W / 2 - d.cx);
        const scale = clamp(d.scale * (curDistX / (d.visW / 2 || 1)), 5, 400);
        update(d.id, { scale: Math.round(scale * 10) / 10 });
      } else {
        const newW = (mx - W / 2 - d.ax) * d.hx;
        const scale = clamp(d.scale * (newW / d.visW), 5, 400);
        const r = scale / d.scale;
        update(d.id, { scale: Math.round(scale * 10) / 10, x: Math.round(d.ax + (d.cx - d.ax) * r), y: Math.round(d.ay + (d.cy - d.ay) * r) });
      }
    } else {
      const l = layers.find((x) => x.id === d.id);
      const it = l && items.get(l.vaultItemId);
      if (!l || !it) return;
      const fx = fxOf(l);
      const lw = (it.width * l.scale) / 100, lh = (it.height * l.scale) / 100;
      const px = ((mx - (W / 2 + l.x - lw / 2)) / lw) * 100, py = ((my - (H / 2 + l.y - lh / 2)) / lh) * 100;
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
    if (isPanning) setIsPanning(false);
    drag.current = null;
    setGuides({ xs: [], ys: [] });
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      if (initialDragLayers.current && JSON.stringify(initialDragLayers.current) !== JSON.stringify(layersRef.current)) {
        commitHistory(layersRef.current);
      }
      initialDragLayers.current = null;
    }
  };

  const onDoubleClickStage = (e: React.MouseEvent) => {
    const { mx, my } = toMonitor(e.clientX, e.clientY);
    const hit = layers.find((l) => {
      const b = boxOf(l);
      if (!l.visible || !b) return false;
      const cx = mx - W / 2, cy = my - H / 2;
      return cx >= b.l && cx <= b.l + b.w && cy >= b.t && cy <= b.t + b.h;
    });
    if (hit && !hit.locked) {
      setSelectedIds([hit.id]);
      setTool("crop");
    }
  };

  const onWheelStage = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        stepZoom(e.deltaY < 0 ? 1 : -1);
      }
    },
    [stepZoom],
  );

  // Global Canva-Style Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (saveOpen || exportOpen || importOpen) return;
      if (shortcutsOpen) {
        if (e.key === "Escape") setShortcutsOpen(false);
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;
      const key = e.key.toLowerCase();

      // Spacebar panning
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpaceDown(true);
        return;
      }

      // Cheat sheet (?)
      if (e.key === "?" || (isShift && key === "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // History & Clipboard
      if (isCtrl && key === "z" && !isShift) {
        e.preventDefault();
        undo();
        return;
      }
      if ((isCtrl && isShift && key === "z") || (isCtrl && key === "y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (isCtrl && key === "c") {
        e.preventDefault();
        copyLayers();
        return;
      }
      if (isCtrl && key === "v") {
        e.preventDefault();
        pasteLayers();
        return;
      }
      if (isCtrl && key === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Layer Ordering (Z-Stack)
      if (isCtrl && isShift && (e.key === "}" || e.code === "BracketRight" || e.key === "]")) {
        e.preventDefault();
        bringToFront();
        return;
      }
      if (isCtrl && isShift && (e.key === "{" || e.code === "BracketLeft" || e.key === "[")) {
        e.preventDefault();
        sendToBack();
        return;
      }
      if (isCtrl && !isShift && (e.code === "BracketRight" || e.key === "]")) {
        e.preventDefault();
        bringForward();
        return;
      }
      if (isCtrl && !isShift && (e.code === "BracketLeft" || e.key === "[")) {
        e.preventDefault();
        sendBackward();
        return;
      }

      // Selection & Organization
      if (e.key === "Tab") {
        e.preventDefault();
        cycleSelection(isShift);
        return;
      }
      if (isCtrl && key === "a") {
        e.preventDefault();
        selectAllUnlocked();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        deselectAll();
        return;
      }
      if (e.key === "Enter" && tool === "crop") {
        e.preventDefault();
        setTool("move");
        return;
      }
      if (((isAlt && isShift) || (isCtrl && isShift)) && key === "l") {
        e.preventDefault();
        toggleLockSelected();
        return;
      }
      if (isAlt && isShift && key === "h") {
        e.preventDefault();
        toggleVisibilitySelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length || selectedId) {
          e.preventDefault();
          deleteSelected();
          return;
        }
      }

      // Transform, Flip, Tool & Opacity
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-(isShift ? 10 : 1), 0],
        ArrowRight: [isShift ? 10 : 1, 0],
        ArrowUp: [0, -(isShift ? 10 : 1)],
        ArrowDown: [0, isShift ? 10 : 1],
      };
      if (arrows[e.key]) {
        e.preventDefault();
        nudgeSelected(arrows[e.key][0], arrows[e.key][1]);
        return;
      }
      if (!isCtrl && !isAlt && !isShift && key === "v") {
        setTool("move");
        return;
      }
      if (!isCtrl && !isAlt && !isShift && key === "c") {
        setTool((t) => (t === "crop" ? "move" : "crop"));
        return;
      }
      if (isShift && !isCtrl && !isAlt && key === "h") {
        e.preventDefault();
        flipHorizontalSelected();
        return;
      }
      if (isShift && !isCtrl && !isAlt && key === "v") {
        e.preventDefault();
        flipVerticalSelected();
        return;
      }
      if (!isCtrl && !isAlt && !isShift && /^[0-9]$/.test(e.key) && (selectedIds.length > 0 || selectedId)) {
        e.preventDefault();
        const num = parseInt(e.key, 10);
        setOpacityForSelected(num === 0 ? 100 : num * 10);
        return;
      }

      // Viewport Navigation
      if (isCtrl && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        resetZoomFit();
        return;
      }
      if (isCtrl && (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        stepZoom(1);
        return;
      }
      if (isCtrl && (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        stepZoom(-1);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    saveOpen, exportOpen, importOpen, shortcutsOpen,
    undo, redo, copyLayers, pasteLayers, duplicateSelected,
    bringToFront, sendToBack, bringForward, sendBackward,
    cycleSelection, selectAllUnlocked, deselectAll,
    toggleLockSelected, toggleVisibilitySelected, deleteSelected,
    nudgeSelected, flipHorizontalSelected, flipVerticalSelected,
    setOpacityForSelected, resetZoomFit, stepZoom,
    tool, selectedIds, selectedId,
  ]);

  function handleCustomScreenshot(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = ev.target?.result as string;
      if (res) {
        setCustomShot(res);
        try { localStorage.setItem("iris_custom_ref_shot", res); } catch { /* ignore */ }
        setRef("custom");
      }
    };
    reader.readAsDataURL(f);
  }

  const cycleRes = (dir: 1 | -1) => {
    const list: (CanvasRes | null)[] = [null, ...ALL_RES.map((r) => ({ w: r.w, h: r.h }))];
    const cur = list.findIndex((r) => resKey(r) === resKey(canvasRes));
    p.setCanvasRes(list[(((cur < 0 ? 0 : cur) + dir) % list.length + list.length) % list.length]);
  };

  const stageWidth = zoom === "fit" ? "100%" : `${(W * zoom) / 100}px`;
  const stageMaxWidth = zoom === "fit" ? `calc(50vh * (${W} / ${H}))` : undefined;
  const bgImage = ref === "custom" && customShot ? `url(${customShot})` : undefined;
  const previewLayers = soloId ? layers.map((l) => ({ ...l, visible: l.id === soloId })) : layers;
  const selBox = sel && sel.visible ? boxOf(sel) : null;
  const selFx = sel ? fxOf(sel) : null;
  const cropped = !!selFx && (selFx.cropT || selFx.cropR || selFx.cropB || selFx.cropL);
  const pct = (n: number, total: number) => `${(n / total) * 100}%`;

  return (
    <div className="layering">
      <input ref={customInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => handleCustomScreenshot(e.target.files?.[0])} />
      <PresetBar
        {...p}
        onSave={() => setSaveOpen(true)}
        onExport={() => setExportOpen(true)}
        onImport={() => setImportOpen(true)}
        clear={() => { setLayers(() => []); p.setActivePresetId(null); setSelectedIds([]); setSoloId(null); }}
      />

      <section className="layering-stage-section">
        <div
          className={`lstage-container${isSpaceDown || isPanning ? " panning" : ""}`}
          onWheel={onWheelStage}
        >
          <div
            ref={stage}
            className={`stage lstage bracket bd-${ref === "grid" ? "grid" : "ref"}`}
            style={{
              width: stageWidth,
              maxWidth: stageMaxWidth,
              maxHeight: zoom === "fit" ? "50vh" : undefined,
              aspectRatio: `${W} / ${H}`,
              backgroundImage: bgImage,
              backgroundSize: "100% 100%",
              transform: pan.x !== 0 || pan.y !== 0 ? `translate(${pan.x}px, ${pan.y}px)` : undefined,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onDoubleClickStage}
            onDragOver={(e) => e.dataTransfer.types.includes("application/x-iris-item") && e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("application/x-iris-item");
              const it = items.get(id);
              if (!it) return;
              e.preventDefault();
              const { mx, my } = toMonitor(e.clientX, e.clientY);
              const newId = p.addLayer(it, { x: Math.round(mx - W / 2), y: Math.round(my - H / 2) });
              setSelectedIds([newId]);
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

            {/* Secondary outlines for multi-selection */}
            {selectedIds.length > 1 &&
              layers
                .filter((l) => selectedIds.includes(l.id) && l.id !== selectedId && l.visible)
                .map((l) => {
                  const b = boxOf(l);
                  if (!b) return null;
                  return (
                    <div
                      key={`multi-${l.id}`}
                      className="lbox multi-sel"
                      style={{
                        left: pct(W / 2 + b.l, W),
                        top: pct(H / 2 + b.t, H),
                        width: pct(b.w, W),
                        height: pct(b.h, H),
                        borderStyle: "dashed",
                        opacity: 0.7,
                      }}
                    />
                  );
                })}

            {/* Primary selection box with Floating Contextual Action Pill */}
            {sel && selBox && (
              <div
                className={`lbox${sel.locked ? " locked" : ""}${tool === "crop" ? " cropping" : ""}`}
                style={{ left: pct(W / 2 + selBox.l, W), top: pct(H / 2 + selBox.t, H), width: pct(selBox.w, W), height: pct(selBox.h, H) }}
              >
                {tool === "move" && (
                  <div className={`lbox-floating-pill${H / 2 + selBox.t < 38 ? " below" : ""}`}>
                    <button
                      type="button"
                      className="pill-action-btn"
                      title="Bring Forward (Ctrl + ])"
                      onClick={(e) => { e.stopPropagation(); bringForward(); }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="pill-action-btn"
                      title="Send Backward (Ctrl + [)"
                      onClick={(e) => { e.stopPropagation(); sendBackward(); }}
                    >
                      ▼
                    </button>
                    <div className="pill-divider" />
                    <button
                      type="button"
                      className="pill-action-btn"
                      title="Duplicate (Ctrl + D)"
                      onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      className={`pill-action-btn${sel.locked ? " active-lock" : ""}`}
                      title="Toggle Lock (Alt + Shift + L)"
                      onClick={(e) => { e.stopPropagation(); toggleLockSelected(); }}
                    >
                      <LockIcon open={!sel.locked} />
                    </button>
                    <button
                      type="button"
                      className="pill-action-btn"
                      title="Crop Mode (C or Double-Click)"
                      disabled={sel.locked}
                      onClick={(e) => { e.stopPropagation(); setTool("crop"); }}
                    >
                      ✂
                    </button>
                    <div className="pill-divider" />
                    <button
                      type="button"
                      className="pill-action-btn pill-danger"
                      title="Delete (Del)"
                      disabled={sel.locked}
                      onClick={(e) => { e.stopPropagation(); deleteSelected(); }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}

                {!sel.locked && tool === "move" &&
                  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([hx, hy]) => (
                    <i key={`${hx}${hy}`} className="hnd" data-handle={`${hx},${hy}`} style={{ left: hx < 0 ? 0 : "100%", top: hy < 0 ? 0 : "100%", cursor: hx === hy ? "nwse-resize" : "nesw-resize" }} />
                  ))}
                {!sel.locked && tool === "crop" &&
                  ([
                    ["tl", "0%", "0%", "nwse-resize"], ["t", "50%", "0%", "ns-resize"], ["tr", "100%", "0%", "nesw-resize"], ["r", "100%", "50%", "ew-resize"],
                    ["br", "100%", "100%", "nwse-resize"], ["b", "50%", "100%", "ns-resize"], ["bl", "0%", "100%", "nesw-resize"], ["l", "0%", "50%", "ew-resize"],
                  ] as const).map(([edges, left, top, cursor]) => (
                    <i key={edges} className="hnd crop-hnd" data-crop={edges} style={{ left, top, cursor }} />
                  ))}
                <span className="lbox-tag mono">
                  {selectedIds.length > 1
                    ? `${selectedIds.length} layers selected`
                    : `${sel.name} · ${Math.round(sel.x)},${Math.round(sel.y)} · ${sel.scale.toFixed(0)}%${cropped ? " · ✂ cropped" : ""}`}
                </span>
              </div>
            )}
            <div className="stage-tag mono">{canvasRes ? `Canvas ${W}×${H} (${aspectTag(W, H)})` : mon ? monitorLabel(mon) : "Display"}</div>
          </div>
        </div>

        <div className="layering-controls-dock card bracket">
          <div className="canvas-toolbar">
            <div className="seg" title="Zoom levels (or Ctrl+Wheel / Ctrl+0 to Fit)">
              {(["fit", 50, 100] as const).map((z) => (
                <button
                  key={z}
                  className={zoom === z ? "active" : ""}
                  onClick={() => { setZoom(z); if (z === "fit") setPan({ x: 0, y: 0 }); }}
                >
                  {z === "fit" ? "Fit" : `${z}%`}
                </button>
              ))}
              {typeof zoom === "number" && zoom !== 50 && zoom !== 100 && (
                <button className="active">{zoom}%</button>
              )}
            </div>

            <div className="tool-group" title="Undo / Redo (50-step History)">
              <button
                type="button"
                className="btn small outline num-btn"
                disabled={!canUndo}
                onClick={undo}
                title="Undo (Ctrl + Z)"
              >
                ↶
              </button>
              <button
                type="button"
                className="btn small outline num-btn"
                disabled={!canRedo}
                onClick={redo}
                title="Redo (Ctrl + Shift + Z / Ctrl + Y)"
              >
                ↷
              </button>
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
              <button type="button" className="btn small outline" onClick={() => customInput.current?.click()} title="Upload or change custom in-game screenshot">
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

          <div className="canvas-toolbar tools-bar">
            <div className="seg" title="Tool (press C to toggle crop, V for move)">
              <button className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}>✥ Move</button>
              <button className={tool === "crop" ? "active" : ""} onClick={() => setTool("crop")}>✂ Crop</button>
            </div>
            <div className="tool-group" title="Align the selected layer to the canvas">
              {([["l", "⇤", "Align left"], ["cx", "↔", "Center horizontally"], ["r", "⇥", "Align right"], ["t", "⤒", "Align top"], ["cy", "↕", "Center vertically"], ["b", "⤓", "Align bottom"]] as const).map(([k, g, t]) => (
                <button key={k} className="btn small outline num-btn" disabled={!sel || sel.locked} title={t} onClick={() => align(k)}>{g}</button>
              ))}
            </div>
            <div className="tool-group">
              <button className={`btn small ${selFx?.flipX ? "primary" : "outline"}`} disabled={!sel || sel.locked} title="Flip horizontally (Shift+H)" onClick={flipHorizontalSelected}>⇋ Flip X</button>
              <button className={`btn small ${selFx?.flipY ? "primary" : "outline"}`} disabled={!sel || sel.locked} title="Flip vertically (Shift+V)" onClick={flipVerticalSelected}>⇅ Flip Y</button>
            </div>
            <div className="tool-group" title="Chop the selected layer into two independent pieces (non-destructive)">
              <span className="mono small muted">Chop @</span>
              <input className="input chop-pct" type="number" min={5} max={95} value={chopPct} onChange={(e) => setChopPct(Number(e.target.value) || 50)} />
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
        </div>

        <div className="layering-summary-bar">
          <div className="tips mono small muted">
            <span className="tip-chip"><b>Space+Drag</b> Pan</span>
            <span className="tip-chip"><b>Ctrl+Wheel</b> Zoom</span>
            <span className="tip-chip"><b>Ctrl+Z / Y</b> Undo / Redo</span>
            <span className="tip-chip"><b>V / C</b> Move / Crop</span>
            <span className="tip-chip"><b>1–0</b> Opacity</span>
            <span className="tip-chip"><b>Shift+H/V</b> Flip</span>
            <span className="tip-chip"><b>Tab</b> Cycle</span>
            <span className="tip-chip"><b>Shift+Click</b> Multi-select</span>
          </div>
          <button
            type="button"
            className="shortcuts-pill-btn"
            onClick={() => setShortcutsOpen(true)}
            title="View all Canva-style keyboard shortcuts (?)"
          >
            ⌨️ Shortcuts (?)
          </button>
        </div>
      </section>

      <div className="layering-workbench">
        <LayerDrawer
          vault={vault}
          onAdd={(it) => {
            const newId = p.addLayer(it);
            setSelectedIds([newId]);
          }}
        />
        <LayerStack
          vault={vault}
          layers={layers}
          setLayers={setLayers}
          selectedId={selectedId}
          selectedIds={selectedIds}
          select={selectLayer}
          update={update}
          duplicate={duplicateSingle}
          remove={removeSingle}
        />
        <LayerInspector
          vault={vault}
          layers={layers}
          selectedId={selectedId}
          selectedIds={selectedIds}
          update={update}
          updateFx={updateFx}
          roleHotkeys={p.settings.layerHotkeys}
        />
      </div>

      {saveOpen && (
        <SavePresetModal
          vault={vault} layers={layers} active={activePreset} refW={W} refH={H}
          onClose={() => setSaveOpen(false)}
          onSaved={(v, id) => { p.setVault(v); p.setActivePresetId(id); setSaveOpen(false); }}
        />
      )}
      {exportOpen && <ExportPresetModal layers={layers} active={activePreset} vault={vault} refW={W} refH={H} onClose={() => setExportOpen(false)} />}
      {importOpen && (
        <ImportPresetModal
          vault={vault}
          onImport={(importedLayers, meta) => {
            setLayers(() => importedLayers);
            p.setActivePresetId(null);
            setSelectedIds(importedLayers[0] ? [importedLayers[0].id] : []);
            if (meta.refW && meta.refH) p.setCanvasRes({ w: meta.refW, h: meta.refH });
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const groups = [
    {
      title: "History & Clipboard",
      items: [
        { label: "Undo last operation", keys: ["Ctrl", "Z"] },
        { label: "Redo operation", keys: ["Ctrl", "Shift", "Z"] },
        { label: "Copy selected layer(s)", keys: ["Ctrl", "C"] },
        { label: "Paste layer(s) (+16px offset)", keys: ["Ctrl", "V"] },
        { label: "Duplicate selected layer(s)", keys: ["Ctrl", "D"] },
      ],
    },
    {
      title: "Layer Ordering (Z-Stack Manipulation)",
      items: [
        { label: "Bring Forward 1 slot", keys: ["Ctrl", "]"] },
        { label: "Send Backward 1 slot", keys: ["Ctrl", "["] },
        { label: "Bring to Front (very top)", keys: ["Ctrl", "Shift", "]"] },
        { label: "Send to Back (very bottom)", keys: ["Ctrl", "Shift", "["] },
      ],
    },
    {
      title: "Selection, Visibility & Locking",
      items: [
        { label: "Cycle selection next", keys: ["Tab"] },
        { label: "Cycle selection prev", keys: ["Shift", "Tab"] },
        { label: "Multi-select layers", keys: ["Shift", "Click"] },
        { label: "Select all unlocked layers", keys: ["Ctrl", "A"] },
        { label: "Deselect all / Exit crop", keys: ["Esc"] },
        { label: "Toggle Lock / Unlock", keys: ["Alt", "Shift", "L"] },
        { label: "Toggle Hide / Show", keys: ["Alt", "Shift", "H"] },
        { label: "Delete selected layer(s)", keys: ["Del"] },
      ],
    },
    {
      title: "Transform, Opacity & Crop",
      items: [
        { label: "Nudge 1px", keys: ["Arrows"] },
        { label: "Fast nudge 10px", keys: ["Shift", "Arrows"] },
        { label: "Move tool", keys: ["V"] },
        { label: "Crop mode (or double-click)", keys: ["C"] },
        { label: "Confirm / Apply crop", keys: ["Enter"] },
        { label: "Flip horizontal (Flip X)", keys: ["Shift", "H"] },
        { label: "Flip vertical (Flip Y)", keys: ["Shift", "V"] },
        { label: "Symmetric center scale", keys: ["Alt", "Drag Handle"] },
        { label: "Quick opacity (10% – 100%)", keys: ["1", "–", "9", "0"] },
      ],
    },
    {
      title: "Canvas Viewport Navigation",
      items: [
        { label: "Pan zoomed canvas", keys: ["Space", "Drag"] },
        { label: "Middle-click pan", keys: ["Middle-Click", "Drag"] },
        { label: "Smooth step zoom", keys: ["Ctrl", "Wheel"] },
        { label: "Zoom in / Zoom out", keys: ["Ctrl", "+ / -"] },
        { label: "Reset zoom to Fit", keys: ["Ctrl", "0"] },
      ],
    },
  ];

  return (
    <Modal title="⌨️ Layering Keyboard Shortcuts" onClose={onClose} width={680}>
      <div className="shortcuts-modal-grid">
        {groups.map((group) => (
          <div key={group.title} className="shortcuts-card">
            <div className="shortcuts-card-title">{group.title}</div>
            <div className="shortcuts-list">
              {group.items.map((it) => (
                <div key={it.label} className="shortcut-item-row">
                  <span className="shortcut-label">{it.label}</span>
                  <span className="shortcut-keys">
                    {it.keys.map((k, idx) => (
                      <kbd key={idx} className="keycap">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
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
          <button className="btn outline small" onClick={async () => p.setVault(await api.savePreset({ ...active, inVault: !active.inVault }))} title="Show this loadout in the Vault tab with a STACK badge">
            {active.inVault ? "Unpin from Vault" : "Pin to Vault"}
          </button>
          <button className="btn outline small danger-o" onClick={async () => { p.setVault(await api.deletePreset(active.id)); p.setActivePresetId(null); }}>Delete</button>
        </>
      )}
      <button className="btn primary small" disabled={!p.layers.length} onClick={p.onSave}>Save Layer Preset</button>
    </div>
  );
}

function SavePresetModal({ vault, layers, active, refW, refH, onClose, onSaved }: {
  vault: VaultData; layers: Layer[]; active: CompositePreset | null; refW: number; refH: number;
  onClose: () => void; onSaved: (v: VaultData, id: string) => void;
}) {
  const [name, setName] = useState(active?.name ?? "");
  const [inVault, setInVault] = useState(active?.inVault ?? true);
  const [asNew, setAsNew] = useState(false);
  const overwrite = !!active && !asNew;

  async function save() {
    const first = vault.items.find((i) => i.id === layers[0]?.vaultItemId);
    const preset: CompositePreset = {
      id: overwrite ? active!.id : uid(), name: name.trim(), game: first?.game ?? null,
      layers: withZ(layers), refW, refH, inVault, createdAt: overwrite ? active!.createdAt : Date.now(),
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

function ExportPresetModal({ layers, active, vault, refW, refH, onClose }: {
  layers: Layer[]; active: CompositePreset | null; vault: VaultData; refW: number; refH: number; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const items = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);

  const presetData = useMemo(() => ({
    irisVersion: "1.0", type: "preset", name: active?.name || "Custom Loadout",
    game: active?.game || items.get(layers[0]?.vaultItemId)?.game || "Other", refW, refH, createdAt: Date.now(),
    layers: layers.map((l) => ({
      name: l.name, role: l.role, zIndex: l.zIndex, visible: l.visible, locked: l.locked,
      x: l.x, y: l.y, scale: l.scale, opacity: l.opacity, hue: l.hue, fx: fxOf(l),
      vaultItemId: l.vaultItemId, assetFile: items.get(l.vaultItemId)?.file,
      assetName: items.get(l.vaultItemId)?.name, game: items.get(l.vaultItemId)?.game,
    })),
  }), [layers, active, items, refW, refH]);

  const jsonString = useMemo(() => JSON.stringify(presetData, null, 2), [presetData]);
  const shareCode = useMemo(() => {
    try { return `IRIS-PRESET:${btoa(unescape(encodeURIComponent(JSON.stringify(presetData))))}`; }
    catch { return `IRIS-PRESET:${btoa(JSON.stringify(presetData))}`; }
  }, [presetData]);

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(shareCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };

  const downloadFile = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(presetData.name || "loadout").toLowerCase().replace(/[^a-z0-9]/g, "_")}.irispack`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title="Share / Export Preset" onClose={onClose} width={520}>
      <p className="muted small">Share your exact multi-element HUD layout with friends, Discord communities, or Venus Visuals.</p>
      <label className="label">Preset Share Code (One-Click Copy)</label>
      <textarea className="share-code-box" readOnly value={shareCode} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
      <div className="share-actions-row">
        <button className="btn primary grow" onClick={copyCode}>{copied ? "✓ Copied to Clipboard!" : "Copy Share Code"}</button>
        <button className="btn outline" onClick={downloadFile} title="Download as .irispack file">Download .irispack File</button>
      </div>
      <div className="modal-foot"><button className="btn outline" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function ImportPresetModal({ vault, onImport, onClose }: {
  vault: VaultData;
  onImport: (presetLayers: Layer[], presetMeta: { name: string; game: string | null; refW: number; refH: number }) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleProcess = (rawText: string) => {
    setError("");
    const parsed = parsePresetPayload(rawText, vault.items);
    if (!parsed) return setError("Invalid IRIS-PRESET share code or JSON format.");
    onImport(parsed.layers, parsed);
    onClose();
  };

  const handleFileUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && handleProcess(reader.result);
    reader.readAsText(file);
  };

  return (
    <Modal title="Import Layer Preset" onClose={onClose} width={500}>
      <p className="muted small">Paste a preset share code (`IRIS-PRESET:...`) or upload a `.irispack` / `.iris` JSON file.</p>
      <label className="label">Paste Share Code or JSON</label>
      <textarea className="share-code-box" placeholder="IRIS-PRESET:eyJ2ZXJzaW9uIjoxLC..." value={code} onChange={(e) => setCode(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <div className="share-actions-row">
        <label className="btn outline grow" style={{ textAlign: "center", cursor: "pointer" }}>
          📁 Browse .irispack File
          <input type="file" accept=".irispack,.iris,.json" hidden onChange={(e) => handleFileUpload(e.target.files?.[0])} />
        </label>
        <button className="btn primary grow" disabled={!code.trim()} onClick={() => handleProcess(code)}>Load into Workspace</button>
      </div>
      <div className="modal-foot"><button className="btn outline" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
