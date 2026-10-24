import { useCallback, useEffect, useRef, useState } from "react";
import { api, assetUrl } from "../api";
import {
  DEFAULT_TRANSFORM,
  type MonitorInfo,
  type OverlayState,
  type OverlayStatus,
  type Settings,
  type Transform,
  type VaultData,
  type VaultItem,
} from "../types";
import { clamp, monitorLabel, resolutionTag } from "../util";
import { OverlayLayer } from "../OverlayLayer";
import { NumField, SliderRow, Toggle } from "./ui";

interface Props {
  vault: VaultData;
  setVault: (v: VaultData) => void;
  item: VaultItem | null;
  overlay: OverlayState;
  setOverlay: (f: (o: OverlayState) => OverlayState) => void;
  monitors: MonitorInfo[];
  status: OverlayStatus;
  goVault: () => void;
  compositeLive: boolean;
  stopComposite: () => void;
  settings?: Settings;
  saveSettings?: (p: Partial<Settings>) => void;
}

export function Display({
  vault,
  setVault,
  item,
  overlay,
  setOverlay,
  monitors,
  status,
  goVault,
  compositeLive,
  stopComposite,
  settings,
  saveSettings,
}: Props) {
  const [adjusting, setAdjusting] = useState(false);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [grid10, setGrid10] = useState(false);
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null });
  const [snapBadge, setSnapBadge] = useState("");

  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const t = overlay.transform;
  const mon = monitors[overlay.monitor] ?? monitors[0];
  const mw = mon?.width ?? 1920;
  const mh = mon?.height ?? 1080;
  const k = boxW / mw;

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [item]);

  // show alignment guides while transform values are being changed
  const guideTimer = useRef<number>();
  const flash = useCallback(() => {
    setAdjusting(true);
    window.clearTimeout(guideTimer.current);
    guideTimer.current = window.setTimeout(() => setAdjusting(false), 1400);
  }, []);

  const patch = useCallback(
    (p: Partial<Transform>) => {
      setOverlay((o) => ({ ...o, transform: { ...o.transform, ...p } }));
      setSaved(false);
      flash();
    },
    [setOverlay, flash],
  );

  if (!item) {
    return (
      <div className="page center">
        <div className="empty card bracket">
          <div className="empty-title">No overlay loaded</div>
          <p>Double-click a design in the Vault to project it onto your screen.</p>
          <button className="btn primary" onClick={goVault}>Open Vault</button>
        </div>
      </div>
    );
  }

  const src = assetUrl(vault.assetsDir, item.file);

  // Sizing & Alignment presets
  const fitScreen = () => {
    flash();
    const scale = Math.round(Math.min(mw / item.width, mh / item.height) * 1000) / 10;
    patch({ x: 0, y: 0, scale });
  };

  const fillScreen = () => {
    flash();
    const scale = Math.round(Math.max(mw / item.width, mh / item.height) * 1000) / 10;
    patch({ x: 0, y: 0, scale });
  };

  const native1to1 = () => {
    flash();
    patch({ x: 0, y: 0, scale: 100 });
  };

  const snapCenter = () => {
    flash();
    patch({ x: 0, y: 0 });
  };

  const roundTo10 = () => {
    flash();
    patch({
      x: Math.round(t.x / 10) * 10,
      y: Math.round(t.y / 10) * 10,
    });
  };

  const nudge = (dx: number, dy: number) => patch({ x: t.x + dx * step, y: t.y + dy * step });
  const bw = (item.width * t.scale) / 100;
  const bh = (item.height * t.scale) / 100;

  return (
    <div className="page display">
      <section className="viewport">
        <div className="vp-head">
          <div>
            <div className="vp-title-row">
              <h2>{item.name}</h2>
              <button
                type="button"
                className={`fav-star-btn${item.favorite ? " active" : ""}`}
                title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                onClick={async () => {
                  setVault(await api.updateItem(item.id, { favorite: !item.favorite }));
                }}
              >
                {item.favorite ? "\u2605" : "\u2606"}
              </button>
              {t.chromaCycle && (
                <span className="rainbow-badge mono" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>
                  RAINBOW ACTIVE
                </span>
              )}
            </div>
            <div className="mono muted small">
              {item.width}x{item.height} · {resolutionTag(item.width, item.height)} · {item.game}
            </div>
          </div>

          <div className="vp-quick-actions">
            <button
              type="button"
              className={`btn small ${snapEnabled ? "primary" : "outline"}`}
              onClick={() => setSnapEnabled(!snapEnabled)}
              title="Snap to monitor center and edges when dragging near them (Hold Alt to bypass)"
            >
              {snapEnabled ? "✓ Center Snapping" : "Snapping Off"}
            </button>
            <button
              type="button"
              className={`btn small ${grid10 ? "primary" : "outline"}`}
              onClick={() => setGrid10(!grid10)}
              title="Drag and nudge in 10px increments (or hold Shift while dragging)"
            >
              {grid10 ? "✓ 10px Grid Active" : "10px Grid Snap"}
            </button>
            <button
              type="button"
              className="btn small outline"
              onClick={fitScreen}
              title="Fit overlay entirely inside your monitor"
            >
              Fit Screen
            </button>
            <button
              type="button"
              className="btn small outline"
              onClick={native1to1}
              title="Reset overlay scale to 1:1 original native size"
            >
              1:1 Native
            </button>
            <button
              type="button"
              className="btn small outline"
              onClick={snapCenter}
              title="Center overlay horizontally and vertically (X:0, Y:0)"
            >
              Center
            </button>
          </div>
        </div>

        <div
          ref={box}
          className="stage bracket bd-grid"
          style={{
            aspectRatio: `${mw} / ${mh}`,
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
            flash();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;

            let rawX = d.x + (e.clientX - d.px) / k;
            let rawY = d.y + (e.clientY - d.py) / k;

            let gx: number | null = null;
            let gy: number | null = null;
            const labels: string[] = [];

            const useGrid10 = grid10 || e.shiftKey;
            const bypassSnap = e.altKey;

            if (useGrid10) {
              rawX = Math.round(rawX / 10) * 10;
              rawY = Math.round(rawY / 10) * 10;
              labels.push("10px GRID");
            }

            if (snapEnabled && !bypassSnap) {
              const snapDist = 14;

              // Snap X to center (x = 0)
              if (Math.abs(rawX) <= snapDist) {
                rawX = 0;
                gx = mw / 2;
                labels.push("CENTER X");
              } else {
                const leftSnap = -mw / 2 + bw / 2;
                const rightSnap = mw / 2 - bw / 2;
                if (Math.abs(rawX - leftSnap) <= snapDist) {
                  rawX = leftSnap;
                  gx = 0;
                  labels.push("LEFT EDGE");
                } else if (Math.abs(rawX - rightSnap) <= snapDist) {
                  rawX = rightSnap;
                  gx = mw;
                  labels.push("RIGHT EDGE");
                }
              }

              // Snap Y to center (y = 0)
              if (Math.abs(rawY) <= snapDist) {
                rawY = 0;
                gy = mh / 2;
                labels.push("CENTER Y");
              } else {
                const topSnap = -mh / 2 + bh / 2;
                const bottomSnap = mh / 2 - bh / 2;
                if (Math.abs(rawY - topSnap) <= snapDist) {
                  rawY = topSnap;
                  gy = 0;
                  labels.push("TOP EDGE");
                } else if (Math.abs(rawY - bottomSnap) <= snapDist) {
                  rawY = bottomSnap;
                  gy = mh;
                  labels.push("BOTTOM EDGE");
                }
              }
            }

            setGuides({ gx, gy });
            setSnapBadge(labels.join(" · "));
            patch({ x: Math.round(rawX), y: Math.round(rawY) });
          }}
          onPointerUp={() => {
            drag.current = null;
            setGuides({ gx: null, gy: null });
            setSnapBadge("");
          }}
          onPointerCancel={() => {
            drag.current = null;
            setGuides({ gx: null, gy: null });
            setSnapBadge("");
          }}
        >
          {guides.gx !== null && <div className="guide v" style={{ left: `${(guides.gx / mw) * 100}%` }} />}
          {guides.gy !== null && <div className="guide h" style={{ top: `${(guides.gy / mh) * 100}%` }} />}
          {snapBadge && <div className="guide-badge mono">{snapBadge}</div>}

          <OverlayLayer src={src} imgW={item.width} imgH={item.height} t={t} monitorW={mw} monitorH={mh} k={k}>
            {adjusting && (
              <div
                className="bbox"
                style={{ left: mw / 2 + t.x - bw / 2, top: mh / 2 + t.y - bh / 2, width: bw, height: bh, outlineWidth: 1 / k }}
              />
            )}
          </OverlayLayer>
          {adjusting && (
            <>
              <div className="xhair v" />
              <div className="xhair h" />
              <div className="readout mono">
                X {Math.round(t.x)} · Y {Math.round(t.y)} · {t.scale.toFixed(1)}%
              </div>
            </>
          )}
          <div className="stage-tag mono">{mon ? monitorLabel(mon) : "Display"}</div>
        </div>
        <div className="muted small">
          Tip: Drag inside preview to reposition • Hold <span className="mono" style={{ color: "var(--cyan)" }}>Shift</span> for 10px snap • Hold <span className="mono" style={{ color: "var(--pink)" }}>Alt</span> for free drag • Visual guides snap to monitor center &amp; edges.
        </div>
      </section>

      <aside className="inspector card bracket">
        {compositeLive && (
          <div className="note composite-note mono">
            ▣ A layered composite is currently live. <button className="linkbtn" onClick={stopComposite}>Switch to this single overlay</button>
          </div>
        )}
        <div className="master">
          <div>
            <div className="master-title">Enable Overlay on Screen</div>
            <div className={`mono small ${status.visible ? "ok" : "muted"}`}>
              {status.visible ? "● PROJECTING" : overlay.enabled ? "○ WAITING FOR GAME" : "○ OFF"}
            </div>
          </div>
          <Toggle
            large
            checked={overlay.enabled}
            onChange={(v) => {
              setOverlay((o) => ({ ...o, enabled: v }));
              // If turning on while in game-mode and target game isn't running, auto-switch to topmost so it shows immediately!
              if (v && settings?.targetMode === "game" && !status.gameRunning) {
                saveSettings?.({ targetMode: "topmost" });
              }
            }}
          />
        </div>

        <div className="display-mode-card" style={{ marginTop: 8, padding: 10, background: "#0c0d18", border: "1px solid var(--border)", borderRadius: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="mono bold small" style={{ color: "var(--cyan)" }}>Display Target Mode</span>
            <span className={`tag mono ${settings?.targetMode !== "game" ? "ok" : ""}`} style={{ fontSize: 10 }}>
              {settings?.targetMode !== "game" ? "ALWAYS VISIBLE" : "GAME ONLY"}
            </span>
          </div>
          <div className="seg full" style={{ display: "flex", width: "100%" }}>
            <button
              type="button"
              className={settings?.targetMode !== "game" ? "active" : ""}
              onClick={() => saveSettings?.({ targetMode: "topmost" })}
              title="Force overlay visible always over any game (Call of Duty, OW2, Apex) or desktop"
            >
              Force on Screen (Any Game / Desktop)
            </button>
            <button
              type="button"
              className={settings?.targetMode === "game" ? "active" : ""}
              onClick={() => saveSettings?.({ targetMode: "game" })}
              title="Overlay only appears when the assigned game process is running"
            >
              Auto-Attach ({settings?.targetExe || "Game"} Only)
            </button>
          </div>
          {settings?.targetMode === "game" && !status.visible && overlay.enabled && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="mono mini warn" style={{ color: "var(--gold)" }}>
                Waiting for {settings?.targetExe || "game"}...
              </span>
              <button
                type="button"
                className="btn primary small"
                style={{ padding: "3px 10px", fontSize: 11 }}
                onClick={() => saveSettings?.({ targetMode: "topmost" })}
                title="Bypass game requirement and force show on screen right now"
              >
                Force Show Now
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <label>Target Monitor</label>
          <select
            className="input full"
            value={overlay.monitor}
            onChange={(e) => setOverlay((o) => ({ ...o, monitor: Number(e.target.value) }))}
          >
            {monitors.map((m) => (
              <option key={m.index} value={m.index}>{monitorLabel(m)}</option>
            ))}
          </select>
        </div>

        <h5 className="section">Transform &amp; Alignment</h5>
        <SliderRow
          label="Scale / Size"
          value={t.scale}
          min={10}
          max={200}
          suffix="%"
          onChange={(v) => patch({ scale: clamp(v, 1, 400) })}
          extra={
            <div className="scale-quick-row">
              <button className="btn small outline num-btn" onClick={() => patch({ scale: clamp(t.scale - 1, 1, 400) })} title="Decrease scale by 1%">-</button>
              <button className="btn small outline num-btn" onClick={() => patch({ scale: clamp(t.scale + 1, 1, 400) })} title="Increase scale by 1%">+</button>
              <button className="btn small outline" onClick={native1to1} title="Reset to original 100% native size">1:1 Native</button>
              <button className="btn small outline" onClick={fitScreen} title="Fit to screen dimensions">Fit Screen</button>
            </div>
          }
        />
        <SliderRow label="Opacity" value={t.opacity} min={0} max={100} suffix="%" onChange={(v) => patch({ opacity: clamp(v, 0, 100) })} />

        <div className="field">
          <div className="field-head">
            <label>Position (X / Y offset)</label>
            <select className="input mini" value={step} onChange={(e) => setStep(Number(e.target.value))}>
              <option value={1}>1 px</option>
              <option value={5}>5 px</option>
              <option value={10}>10 px</option>
              <option value={25}>25 px</option>
              <option value={50}>50 px</option>
            </select>
          </div>
          <div className="pos-row">
            <div className="xy">
              <span className="mono muted">X</span>
              <NumField value={t.x} min={-8000} max={8000} onChange={(v) => patch({ x: v })} width={84} />
              <span className="mono muted">Y</span>
              <NumField value={t.y} min={-8000} max={8000} onChange={(v) => patch({ y: v })} width={84} />
            </div>
            <div className="dpad">
              <button onClick={() => nudge(0, -1)} style={{ gridArea: "u" }} aria-label="Up">▲</button>
              <button onClick={() => nudge(-1, 0)} style={{ gridArea: "l" }} aria-label="Left">◀</button>
              <button onClick={snapCenter} style={{ gridArea: "c" }} aria-label="Center" title="Snap to center">●</button>
              <button onClick={() => nudge(1, 0)} style={{ gridArea: "r" }} aria-label="Right">▶</button>
              <button onClick={() => nudge(0, 1)} style={{ gridArea: "d" }} aria-label="Down">▼</button>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn small outline" onClick={snapCenter} title="Set X:0, Y:0">Snap Center</button>
            <button className="btn small outline" onClick={roundTo10} title="Round current X & Y to nearest 10px">Round 10px</button>
            <button className="btn small outline" onClick={fitScreen} title="Scale & center to fit monitor">Fit Screen</button>
            <button className="btn small outline" onClick={fillScreen} title="Scale & center to fill monitor without border gaps">Fill Screen</button>
          </div>
        </div>

        <h5 className="section">Color &amp; Visual Tweaks</h5>

        {/* Rainbow / Chroma Cycle Card */}
        <div
          className="rainbow-card"
          style={{
            marginBottom: 14,
            padding: 12,
            background: t.chromaCycle ? "rgba(236, 72, 153, 0.08)" : "#0c0d18",
            border: t.chromaCycle ? "1px solid var(--pink)" : "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: t.chromaCycle ? "0 0 16px rgba(236, 72, 153, 0.2)" : undefined,
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🌈</span>
              <div>
                <div className="bold" style={{ fontSize: 13, color: t.chromaCycle ? "var(--pink)" : "var(--text)" }}>
                  Animated Rainbow / Chroma Cycle
                </div>
                <div className="mono mini muted" style={{ fontSize: 10 }}>
                  360° animated spectrum cycling · 0% CPU cost
                </div>
              </div>
            </div>
            <Toggle
              checked={Boolean(t.chromaCycle)}
              onChange={(v) => patch({ chromaCycle: v })}
            />
          </div>

          {t.chromaCycle && (
            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
              <SliderRow
                label="Cycle Speed"
                value={t.chromaSpeed || 6}
                min={1}
                max={25}
                suffix="s"
                onChange={(v) => patch({ chromaSpeed: v })}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {[
                  { label: "⚡ Turbo (2s)", sec: 2 },
                  { label: "🌈 Smooth (6s)", sec: 6 },
                  { label: "✨ Ambient (12s)", sec: 12 },
                  { label: "🌌 Slow (20s)", sec: 20 },
                ].map((preset) => (
                  <button
                    key={preset.sec}
                    type="button"
                    className={`btn mini ${(t.chromaSpeed || 6) === preset.sec ? "primary" : "outline"}`}
                    style={{ flex: 1, padding: "3px 4px", fontSize: 10 }}
                    onClick={() => patch({ chromaSpeed: preset.sec })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <SliderRow
          label="Hue Shift / Tint"
          value={t.hue}
          min={-180}
          max={180}
          suffix="°"
          sliderClassName="hue-slider"
          onChange={(v) => patch({ hue: clamp(v, -180, 180) })}
          extra={
            <div className="swatches-row">
              {[
                { label: "Emerald (Matrix)", color: "#10B981", hue: 140 },
                { label: "Celestial Cyan", color: "#06B6D4", hue: 180 },
                { label: "Cyber Purple", color: "#8B5CF6", hue: -95 },
                { label: "Neon Pink", color: "#EC4899", hue: -35 },
                { label: "Solar Amber", color: "#F59E0B", hue: 45 },
                { label: "Crimson Red", color: "#EF4444", hue: 0 },
              ].map((s) => (
                <button
                  key={s.color}
                  type="button"
                  className={`swatch-btn${Math.abs(t.hue - s.hue) < 5 ? " active" : ""}`}
                  style={{ backgroundColor: s.color, color: s.color }}
                  title={`${s.label} (${s.hue}°)`}
                  onClick={() => patch({ hue: s.hue })}
                />
              ))}
              <button
                type="button"
                className="swatch-btn swatch-reset"
                title="Reset color tint to original asset colors"
                onClick={() => patch({ hue: 0, brightness: 100, contrast: 100 })}
              >
                Reset
              </button>
            </div>
          }
        />
        <SliderRow label="Brightness" value={t.brightness} min={50} max={150} suffix="%" onChange={(v) => patch({ brightness: clamp(v, 0, 300) })} />
        <SliderRow label="Contrast" value={t.contrast} min={50} max={150} suffix="%" onChange={(v) => patch({ contrast: clamp(v, 0, 300) })} />

        <div className="btn-row stick">
          <button
            className="btn primary grow"
            onClick={async () => {
              setVault(await api.updateItem(item.id, { transform: t }));
              setSaved(true);
            }}
          >
            {saved ? "✓ Profile Saved" : "Save Profile to Vault Item"}
          </button>
          <button
            className="btn outline"
            title="Reset to saved calibration (or defaults)"
            onClick={() => patch({ ...(item.transform ?? DEFAULT_TRANSFORM) })}
          >
            Reset
          </button>
        </div>
      </aside>
    </div>
  );
}
