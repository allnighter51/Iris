import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { CompositePreset, Layer, MonitorInfo, Settings, VaultData, VaultItem } from "../types";
import { snap1, uid, withZ } from "../layers";
import { clamp, monitorLabel } from "../util";
import { LayerDrawer } from "./LayerDrawer";
import { LayerPanel } from "./LayerPanel";
import { REF_OPTIONS, RefBackdrop, SceneImages, type RefKey } from "./SceneView";
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
}

type Drag =
  | { mode: "move"; id: string; px: number; py: number; x: number; y: number; w: number; h: number }
  | { mode: "resize"; id: string; sx: number; sy: number; ox: number; oy: number; iw: number; ih: number }
  | null;

const SNAP_PX = 8;

export function Layering(p: Props) {
  const { vault, layers, setLayers, monitors } = p;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"fit" | 50 | 100>("fit");
  const [ref, setRef] = useState<RefKey>("grid");
  const [shot, setShot] = useState<string | null>(null);
  const [customShot, setCustomShot] = useState<string | null>(() => localStorage.getItem("iris_custom_ref_shot"));
  const [note, setNote] = useState("");
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null });
  const [saveOpen, setSaveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const customInput = useRef<HTMLInputElement>(null);

  const mon = monitors[p.monitor] ?? monitors[0];
  const W = mon?.width ?? 1920;
  const H = mon?.height ?? 1080;
  const items = useMemo(() => new Map(vault.items.map((i) => [i.id, i])), [vault.items]);
  const sel = layers.find((l) => l.id === selectedId) ?? null;
  const activePreset = vault.presets.find((x) => x.id === p.activePresetId) ?? null;

  const update = useCallback(
    (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    [setLayers],
  );
  const duplicate = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    const copy: Layer = { ...src, id: uid(), name: src.name + " copy", x: src.x + 20, y: src.y + 20, locked: false };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      return i < 0 ? ls : [...ls.slice(0, i), copy, ...ls.slice(i)];
    });
    setSelectedId(copy.id);
  };
  const remove = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const size = (l: Layer) => {
    const it = items.get(l.vaultItemId);
    return it ? { w: (it.width * l.scale) / 100, h: (it.height * l.scale) / 100, iw: it.width, ih: it.height } : null;
  };
  const toMonitor = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    const k = r.width / W;
    return { mx: (cx - r.left) / k, my: (cy - r.top) / k, k };
  };

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const { mx, my } = toMonitor(e.clientX, e.clientY);
    const handle = (e.target as HTMLElement).dataset.handle;
    if (handle && sel && !sel.locked) {
      const s = size(sel)!;
      const [hx, hy] = handle.split(",").map(Number);
      stage.current!.setPointerCapture(e.pointerId);
      drag.current = {
        mode: "resize",
        id: sel.id,
        sx: hx,
        sy: hy,
        ox: W / 2 + sel.x - hx * (s.w / 2),
        oy: H / 2 + sel.y - hy * (s.h / 2),
        iw: s.iw,
        ih: s.ih,
      };
      return;
    }
    const hit = layers.find((l) => {
      const s = size(l);
      if (!l.visible || !s) return false;
      const cx = W / 2 + l.x;
      const cy = H / 2 + l.y;
      return Math.abs(mx - cx) <= s.w / 2 && Math.abs(my - cy) <= s.h / 2;
    });
    setSelectedId(hit?.id ?? null);
    if (hit && !hit.locked) {
      const s = size(hit)!;
      stage.current!.setPointerCapture(e.pointerId);
      drag.current = { mode: "move", id: hit.id, px: mx, py: my, x: hit.x, y: hit.y, w: s.w, h: s.h };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { mx, my, k } = toMonitor(e.clientX, e.clientY);
    if (d.mode === "move") {
      let x = d.x + (mx - d.px);
      let y = d.y + (my - d.py);
      let gx: number | null = null;
      let gy: number | null = null;
      if (!e.altKey) {
        const sx = snap1(x, d.w, W, SNAP_PX / k);
        const sy = snap1(y, d.h, H, SNAP_PX / k);
        x = sx.pos; y = sy.pos; gx = sx.guide; gy = sy.guide;
      }
      setGuides({ gx, gy });
      update(d.id, { x: Math.round(x), y: Math.round(y) });
    } else {
      const newW = Math.max(8, (mx - d.ox) * d.sx);
      const scale = clamp((newW / d.iw) * 100, 5, 400);
      const nw = (d.iw * scale) / 100;
      const nh = (d.ih * scale) / 100;
      update(d.id, {
        scale: Math.round(scale * 10) / 10,
        x: Math.round(d.ox + d.sx * (nw / 2) - W / 2),
        y: Math.round(d.oy + d.sy * (nh / 2) - H / 2),
      });
    }
  }
  const endDrag = () => {
    drag.current = null;
    setGuides({ gx: null, gy: null });
  };

  async function captureDesktop() {
    setNote("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const v = document.createElement("video");
      v.srcObject = stream;
      await v.play();
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      setShot(c.toDataURL("image/jpeg", 0.85));
      setRef("desktop");
    } catch {
      setNote("Desktop capture was cancelled or is unavailable.");
      setRef("grid");
    }
  }

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

  const stageWidth = zoom === "fit" ? "100%" : `${(W * zoom) / 100}px`;

  const bgImage =
    ref === "desktop" && shot
      ? `url(${shot})`
      : ref === "custom" && customShot
        ? `url(${customShot})`
        : undefined;

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
        clear={() => { setLayers(() => []); p.setActivePresetId(null); setSelectedId(null); }}
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
              {(ref === "ow2" || ref === "valorant" || ref === "rivals") && <RefBackdrop kind={ref} />}
              {ref === "custom" && !customShot && (
                <div className="empty-ref-prompt" onClick={() => customInput.current?.click()}>
                  <div className="prompt-icon">&#x1F4F7;</div>
                  <div className="prompt-title">No in-game screenshot uploaded</div>
                  <div className="muted small">Click to upload a full-screen screenshot (1080p, 1440p, 4K) from Overwatch 2, Valorant, Marvel Rivals, etc.</div>
                  <button type="button" className="btn small primary prompt-btn">Upload Screenshot</button>
                </div>
              )}
              <SceneImages layers={layers} vault={vault} refW={W} refH={H} />

              {guides.gx !== null && <div className="guide v" style={{ left: `${(guides.gx / W) * 100}%` }} />}
              {guides.gy !== null && <div className="guide h" style={{ top: `${(guides.gy / H) * 100}%` }} />}

              {sel && size(sel) && sel.visible && (
                <div
                  className={`lbox${sel.locked ? " locked" : ""}`}
                  style={{
                    left: `${((W / 2 + sel.x - size(sel)!.w / 2) / W) * 100}%`,
                    top: `${((H / 2 + sel.y - size(sel)!.h / 2) / H) * 100}%`,
                    width: `${(size(sel)!.w / W) * 100}%`,
                    height: `${(size(sel)!.h / H) * 100}%`,
                  }}
                >
                  {!sel.locked &&
                    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([hx, hy]) => (
                      <i key={`${hx}${hy}`} className="hnd" data-handle={`${hx},${hy}`} style={{ left: hx < 0 ? 0 : "100%", top: hy < 0 ? 0 : "100%", cursor: hx === hy ? "nwse-resize" : "nesw-resize" }} />
                    ))}
                  <span className="lbox-tag mono">{sel.name} · {Math.round(sel.x)},{Math.round(sel.y)} · {sel.scale.toFixed(0)}%</span>
                </div>
              )}
              <div className="stage-tag mono">{mon ? monitorLabel(mon) : "Display"}</div>
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
                if (v === "desktop" && !shot) captureDesktop();
                else if (v === "custom" && !customShot) customInput.current?.click();
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
            <select className="input mon" value={p.monitor} onChange={(e) => p.setMonitor(Number(e.target.value))}>
              {monitors.map((m) => <option key={m.index} value={m.index}>{monitorLabel(m)}</option>)}
            </select>
            <div className="spacer" />
            {p.live && <span className="mono ok small live-flag">&#x25CF; LIVE SYNC</span>}
            {p.live && <button className="btn outline small" onClick={() => p.setLive(false)}>Stop</button>}
            <button className="btn primary" disabled={!layers.some((l) => l.visible)} onClick={p.push}>
              {p.live ? "Re-push Composite" : "Push Composite to Live Overlay"}
            </button>
          </div>
          {note && <div className="error">{note}</div>}
          <div className="muted small tips">Drag to move · corner handles scale · hold Alt to disable snapping · drop Vault items onto the canvas.</div>
        </section>

        <LayerPanel
          vault={vault}
          layers={layers}
          setLayers={setLayers}
          selectedId={selectedId}
          select={setSelectedId}
          update={update}
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
          onImport={(importedLayers, _meta) => {
            setLayers(() => importedLayers);
            p.setActivePresetId(null);
            setSelectedId(importedLayers[0]?.id ?? null);
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