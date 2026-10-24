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

type Backdrop = "grid" | "desktop" | "sample";

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
  const [backdrop, setBackdrop] = useState<Backdrop>("grid");
  const [desktopShot, setDesktopShot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
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
      stream.getTracks().forEach((tr) => tr.stop());
      setDesktopShot(c.toDataURL("image/jpeg", 0.85));
      setBackdrop("desktop");
    } catch {
      setNote("Desktop capture was cancelled or is unavailable.");
      setBackdrop("grid");
    }
  }

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
  const fit = () => {
    flash();
    patch({ x: 0, y: 0, scale: Math.round(Math.max(mw / item.width, mh / item.height) * 1000) / 10 });
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
            </div>
            <div className="mono muted small">
              {item.width}x{item.height} · {resolutionTag(item.width, item.height)} · {item.game}
            </div>
          </div>
          <div className="seg">
            {(["grid", "sample"] as Backdrop[]).map((b) => (
              <button key={b} className={backdrop === b ? "active" : ""} onClick={() => setBackdrop(b)}>
                {b === "grid" ? "Dark Grid" : "Sample Game"}
              </button>
            ))}
            <button className={backdrop === "desktop" ? "active" : ""} onClick={() => (desktopShot ? setBackdrop("desktop") : captureDesktop())}>
              Desktop Capture
            </button>
          </div>
        </div>

        <div
          ref={box}
          className={`stage bracket bd-${backdrop}`}
          style={{
            aspectRatio: `${mw} / ${mh}`,
            backgroundImage: backdrop === "desktop" && desktopShot ? `url(${desktopShot})` : undefined,
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
            flash();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) patch({ x: Math.round(d.x + (e.clientX - d.px) / k), y: Math.round(d.y + (e.clientY - d.py) / k) });
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {backdrop === "sample" && <SampleScene />}
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
        {note && <div className="error">{note}</div>}
        <div className="muted small">Tip: drag inside the preview to reposition. What you see here is rendered by the same engine as the live overlay.</div>
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
              <button className="btn small outline" onClick={() => patch({ scale: 100 })}>Reset (1:1 Native)</button>
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
              <option value={25}>25 px</option>
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
              <button onClick={() => patch({ x: 0, y: 0 })} style={{ gridArea: "c" }} aria-label="Center" title="Snap to center">●</button>
              <button onClick={() => nudge(1, 0)} style={{ gridArea: "r" }} aria-label="Right">▶</button>
              <button onClick={() => nudge(0, 1)} style={{ gridArea: "d" }} aria-label="Down">▼</button>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn small outline" onClick={() => patch({ x: 0, y: 0 })}>Snap to Center</button>
            <button className="btn small outline" onClick={fit}>Fit to Screen</button>
          </div>
        </div>

        <h5 className="section">Color &amp; Visual Tweaks</h5>
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

/** Fake FPS scene so overlays can be aligned against typical HUD landmarks. */
function SampleScene() {
  return (
    <svg className="sample" viewBox="0 0 1600 900" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2b4a" />
          <stop offset="0.55" stopColor="#6b5b7b" />
          <stop offset="1" stopColor="#2a2433" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#sky)" />
      <path d="M0 560 L240 380 L420 520 L640 330 L900 540 L1180 360 L1400 500 L1600 420 V900 H0Z" fill="#171421" />
      <rect y="640" width="1600" height="260" fill="#0f0d16" />
      <rect x="120" y="60" width="210" height="150" rx="6" fill="#00000066" stroke="#ffffff33" />
      <rect x="1190" y="760" width="300" height="50" rx="4" fill="#00000077" stroke="#ffffff33" />
      <rect x="110" y="760" width="360" height="40" rx="4" fill="#00000077" stroke="#ffffff33" />
      <g stroke="#ffffffaa" strokeWidth="2"><path d="M790 450h-16M810 450h16M800 440v-12M800 460v12" /></g>
    </svg>
  );
}