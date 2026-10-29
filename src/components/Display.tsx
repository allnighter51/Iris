import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, assetUrl } from "../api";
import {
  DEFAULT_TRANSFORM, ELEMENT_TAGS,
  type MonitorInfo, type OverlayState, type OverlayStatus,
  type Settings, type Transform, type VaultData, type VaultItem,
} from "../types";
import { clamp, gameClass, monitorLabel, resolutionTag } from "../util";
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
  goLayering?: () => void;
  goSettings?: () => void;
  compositeLive: boolean;
  compositeLayersCount?: number;
  stopComposite: () => void;
  settings?: Settings;
  saveSettings?: (p: Partial<Settings>) => void;
  onLoadItem?: (item: VaultItem) => void;
}

const HUE_SWATCHES = [
  { label: "Emerald (Matrix)", color: "#10B981", hue: 140 },
  { label: "Celestial Cyan", color: "#06B6D4", hue: 180 },
  { label: "Cyber Purple", color: "#8B5CF6", hue: -95 },
  { label: "Neon Pink", color: "#EC4899", hue: -35 },
  { label: "Solar Amber", color: "#F59E0B", hue: 45 },
  { label: "Crimson Red", color: "#EF4444", hue: 0 },
];

export function Display({
  vault, setVault, item, overlay, setOverlay, monitors, status,
  goVault, goLayering, goSettings, compositeLive, compositeLayersCount,
  stopComposite, settings, saveSettings, onLoadItem,
}: Props) {
  const [adjusting, setAdjusting] = useState(false);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [grid10, setGrid10] = useState(false);
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null });
  const [snapBadge, setSnapBadge] = useState("");
  const [quickSearch, setQuickSearch] = useState("");

  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Persistent Recently Equipped History (4 to 6 items)
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("iris_recent_display_ids");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const recordRecentItem = useCallback((itemId: string) => {
    setRecentIds((prev) => {
      const filtered = prev.filter((id) => id !== itemId);
      const updated = [itemId, ...filtered].slice(0, 8);
      try {
        localStorage.setItem("iris_recent_display_ids", JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  useEffect(() => {
    if (item?.id) {
      recordRecentItem(item.id);
    }
  }, [item?.id, recordRecentItem]);

  const recentDisplayItems = useMemo(() => {
    const map = new Map(vault.items.map((i) => [i.id, i]));
    const validRecents = recentIds.map((id) => map.get(id)).filter((i): i is VaultItem => !!i);

    // If fewer than 3 items, fall back to favorited items
    if (validRecents.length < 3) {
      const seenIds = new Set(validRecents.map((i) => i.id));
      const favorites = vault.items
        .filter((i) => i.favorite && !seenIds.has(i.id))
        .sort((a, b) => b.createdAt - a.createdAt);
      for (const fav of favorites) {
        if (validRecents.length >= 6) break;
        validRecents.push(fav);
        seenIds.add(fav.id);
      }
    }

    // If still fewer than 3 items, augment with newest vault items
    if (validRecents.length < 3) {
      const seenIds = new Set(validRecents.map((i) => i.id));
      const latest = [...vault.items]
        .filter((i) => !seenIds.has(i.id))
        .sort((a, b) => b.createdAt - a.createdAt);
      for (const it of latest) {
        if (validRecents.length >= 6) break;
        validRecents.push(it);
        seenIds.add(it.id);
      }
    }

    return validRecents;
  }, [vault.items, recentIds]);

  // Quick Vault Picker items (Favorites + Search Results)
  const pickerItems = useMemo(() => {
    const query = quickSearch.trim().toLowerCase();
    if (query) {
      return vault.items
        .filter(
          (i) =>
            i.name.toLowerCase().includes(query) ||
            i.game.toLowerCase().includes(query) ||
            (i.tag && i.tag.toLowerCase().includes(query)),
        )
        .slice(0, 12);
    }
    const favs = vault.items.filter((i) => i.favorite).sort((a, b) => b.createdAt - a.createdAt);
    if (favs.length >= 4) return favs.slice(0, 12);
    const seen = new Set(favs.map((f) => f.id));
    const rest = vault.items.filter((i) => !seen.has(i.id)).sort((a, b) => b.createdAt - a.createdAt);
    return [...favs, ...rest].slice(0, 12);
  }, [vault.items, quickSearch]);

  const t = overlay.transform;
  const mon = monitors[overlay.monitor] ?? monitors[0];
  const mw = mon?.width ?? 1920, mh = mon?.height ?? 1080, k = boxW / mw;

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [item]);

  const guideTimer = useRef<number>();
  const flash = useCallback(() => {
    setAdjusting(true);
    window.clearTimeout(guideTimer.current);
    guideTimer.current = window.setTimeout(() => setAdjusting(false), 1400);
  }, []);

  const patch = useCallback((p: Partial<Transform>) => {
    setOverlay((o) => ({ ...o, transform: { ...o.transform, ...p } }));
    setSaved(false);
    flash();
  }, [setOverlay, flash]);

  // Quick-Load Command Deck (Empty State)
  if (!item) {
    return (
      <div className="page display">
        <section className="display-stage-section">
          <div className="stage-container empty-stage-container">
            <div className="stage bracket bd-grid command-deck-stage">
              <div className="quick-load-deck">
                {/* Top Status Header & Quick Actions */}
                <div className="deck-head">
                  <div className="deck-head-info">
                    <div className="deck-badge mono">STANDBY · NO OVERLAY EQUIPPED</div>
                    <h2 className="deck-title">No Single Overlay Equipped</h2>
                    <p className="deck-subtitle">
                      Pick a recent HUD below, choose from your Favorites, or browse your full Vault to project onto your screen.
                    </p>
                  </div>
                  <div className="deck-head-actions">
                    <button type="button" className="btn primary" onClick={goVault}>
                      📁 Open Full Vault
                    </button>
                    {goLayering && (
                      <button type="button" className="btn outline" onClick={goLayering}>
                        ▣ Open Layering Suite
                      </button>
                    )}
                  </div>
                </div>

                {/* Conditional Active Composite Callout */}
                {compositeLive && (
                  <div className="deck-composite-banner">
                    <div className="deck-composite-left">
                      <span className="live-pulse-dot" />
                      <span className="mono bold small" style={{ color: "var(--emerald)" }}>
                        MULTI-LAYER COMPOSITE IS CURRENTLY ACTIVE
                      </span>
                      <span className="mono muted small">
                        ({compositeLayersCount ?? "Multi"} layers live on monitor)
                      </span>
                    </div>
                    <div className="deck-composite-right">
                      {goLayering && (
                        <button type="button" className="btn small primary" onClick={goLayering}>
                          Manage Live Composite →
                        </button>
                      )}
                      <button type="button" className="btn small outline" onClick={stopComposite}>
                        Stop Composite
                      </button>
                    </div>
                  </div>
                )}

                {/* Section A — Recently Equipped */}
                {recentDisplayItems.length > 0 && (
                  <div className="deck-section">
                    <div className="deck-section-head">
                      <div className="deck-section-title">
                        <span>Recently Equipped HUDs</span>
                        <span className="mono muted small">{recentDisplayItems.length} available</span>
                      </div>
                      <span className="mono mini muted">Click any card to project instantly</span>
                    </div>

                    <div className="deck-recents-grid">
                      {recentDisplayItems.slice(0, 4).map((it) => (
                        <div
                          key={it.id}
                          className="deck-recent-card"
                          onClick={() => onLoadItem?.(it)}
                          title={`Click to load and project "${it.name}"`}
                        >
                          <div className="deck-recent-thumb checker">
                            <img
                              src={assetUrl(it.thumb ? vault.thumbsDir : vault.assetsDir, it.thumb ?? it.file)}
                              alt=""
                              loading="lazy"
                            />
                            <span className="mono mini-res">{resolutionTag(it.width, it.height)}</span>
                            <div className="deck-recent-overlay">
                              <span className="btn small primary deck-load-btn">▶ Load &amp; Project</span>
                            </div>
                          </div>
                          <div className="deck-recent-body">
                            <div className="deck-recent-name" title={it.name}>{it.name}</div>
                            <div className="deck-recent-tags">
                              <span className={`chip ${gameClass(it.game)}`}>{it.game}</span>
                              {it.tag && (
                                <span className="chip folder">
                                  {ELEMENT_TAGS.find((t) => t.id === it.tag)?.label ?? it.tag}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section B — Starred Favorites / Quick Vault Picker */}
                <div className="deck-section">
                  <div className="deck-section-head">
                    <div className="deck-section-title">
                      <span>{quickSearch.trim() ? "Search Results" : "★ Starred Favorites & Quick Picker"}</span>
                      <span className="mono muted small">{pickerItems.length} items</span>
                    </div>
                    <div className="deck-search-wrap">
                      <input
                        className="input deck-search-input"
                        placeholder="Quick search Vault (hero, game, tag)..."
                        value={quickSearch}
                        onChange={(e) => setQuickSearch(e.target.value)}
                      />
                      {quickSearch && (
                        <button type="button" className="deck-search-clear" onClick={() => setQuickSearch("")}>✕</button>
                      )}
                    </div>
                  </div>

                  <div className="deck-picker-strip">
                    {pickerItems.map((it) => (
                      <div
                        key={it.id}
                        className="deck-picker-card"
                        onClick={() => onLoadItem?.(it)}
                        title={`Equip "${it.name}"`}
                      >
                        <div className="deck-picker-thumb checker">
                          <img
                            src={assetUrl(it.thumb ? vault.thumbsDir : vault.assetsDir, it.thumb ?? it.file)}
                            alt=""
                            loading="lazy"
                          />
                        </div>
                        <div className="deck-picker-info">
                          <div className="deck-picker-name-row">
                            <span className="deck-picker-name">{it.name}</span>
                            {it.favorite && <span className="fav-star-icon">★</span>}
                          </div>
                          <div className="deck-picker-meta mono mini muted">
                            <span className={`chip mini-chip ${gameClass(it.game)}`}>{it.game}</span>
                            <span>{resolutionTag(it.width, it.height)}</span>
                          </div>
                        </div>
                        <button type="button" className="btn mini outline deck-picker-btn">
                          Equip
                        </button>
                      </div>
                    ))}

                    {!pickerItems.length && (
                      <div className="muted small empty-deck-note">
                        {quickSearch.trim()
                          ? `No designs match "${quickSearch}". Try another name or browse the Vault.`
                          : "No starred favorites yet. Click the ★ icon on any design in the Vault to pin it here for 1-click loading."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="stage-tag mono">{mon ? monitorLabel(mon) : "Display"}</div>
            </div>
          </div>
          <div className="muted small tip-caption">
            Tip: Equip an overlay from the Command Deck above or the Vault to unlock interactive repositioning, scaling, and chroma cycling.
          </div>
        </section>

        {/* Bottom 3-Column Deck in Standby */}
        <div className="display-deck dimmed-standby">
          <section className="card bracket deck-col">
            <div className="panel-title"><span>Overlay Status &amp; Target</span></div>
            <div className="deck-col-content">
              <div className="master">
                <div>
                  <div className="master-title">Enable Overlay on Screen</div>
                  <div className="mono small muted">○ STANDBY (NO OVERLAY)</div>
                </div>
                <Toggle large checked={overlay.enabled} onChange={(v) => setOverlay((o) => ({ ...o, enabled: v }))} />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Target Monitor</label>
                <select className="input full" value={overlay.monitor} onChange={(e) => setOverlay((o) => ({ ...o, monitor: Number(e.target.value) }))}>
                  {monitors.map((m) => <option key={m.index} value={m.index}>{monitorLabel(m)}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="card bracket deck-col">
            <div className="panel-title"><span>Transform &amp; Alignment</span></div>
            <div className="deck-col-content deck-col-standby">
              <div className="standby-note mono small muted">
                🔒 Equip an overlay above to adjust Scale, Opacity, Position X/Y, and Center Snapping.
              </div>
            </div>
          </section>

          <section className="card bracket deck-col">
            <div className="panel-title"><span>Color &amp; Visual Tweaks</span></div>
            <div className="deck-col-content deck-col-standby">
              <div className="standby-note mono small muted">
                🔒 Equip an overlay above to calibrate Chroma Cycle, Hue Tint, Brightness, and Contrast.
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Active Overlay Loaded State
  const src = assetUrl(vault.assetsDir, item.file);
  const fitScreen = () => patch({ x: 0, y: 0, scale: Math.round(Math.min(mw / item.width, mh / item.height) * 1000) / 10 });
  const fillScreen = () => patch({ x: 0, y: 0, scale: Math.round(Math.max(mw / item.width, mh / item.height) * 1000) / 10 });
  const native1to1 = () => patch({ x: 0, y: 0, scale: 100 });
  const snapCenter = () => patch({ x: 0, y: 0 });
  const roundTo10 = () => patch({ x: Math.round(t.x / 10) * 10, y: Math.round(t.y / 10) * 10 });
  const nudge = (dx: number, dy: number) => patch({ x: t.x + dx * step, y: t.y + dy * step });
  const bw = (item.width * t.scale) / 100, bh = (item.height * t.scale) / 100;
  const endDrag = () => { drag.current = null; setGuides({ gx: null, gy: null }); setSnapBadge(""); };

  return (
    <div className="page display">
      <section className="display-stage-section">
        <div className="vp-head">
          <div className="vp-head-left">
            <div className="vp-title-row">
              <h2>{item.name}</h2>
              <button
                type="button"
                className={`fav-star-btn${item.favorite ? " active" : ""}`}
                title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                onClick={async () => setVault(await api.updateItem(item.id, { favorite: !item.favorite }))}
              >
                {item.favorite ? "★" : "☆"}
              </button>
              {t.chromaCycle && <span className="rainbow-badge mono" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>RAINBOW ACTIVE</span>}

              {/* Quick-Swap Switcher & Recent Pills */}
              <div className="quick-swap-group">
                {recentDisplayItems
                  .filter((it) => it.id !== item.id)
                  .slice(0, 3)
                  .map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      className="quick-swap-pill"
                      onClick={() => onLoadItem?.(it)}
                      title={`Quick-swap to "${it.name}" (${it.game})`}
                    >
                      <span className="swap-icon">↻</span>
                      <span className="swap-name">{it.name}</span>
                    </button>
                  ))}

                <div className="quick-swap-select-wrap">
                  <select
                    className="input quick-swap-select"
                    value=""
                    onChange={(e) => {
                      const chosen = vault.items.find((x) => x.id === e.target.value);
                      if (chosen) onLoadItem?.(chosen);
                    }}
                    title="Swap to another overlay from your Vault"
                  >
                    <option value="" disabled>Swap Overlay ▾</option>
                    {recentDisplayItems.filter((x) => x.id !== item.id).length > 0 && (
                      <optgroup label="Recent HUDs">
                        {recentDisplayItems.filter((x) => x.id !== item.id).map((it) => (
                          <option key={`rec-${it.id}`} value={it.id}>{it.name} ({it.game})</option>
                        ))}
                      </optgroup>
                    )}
                    {vault.items.filter((x) => x.favorite && x.id !== item.id).length > 0 && (
                      <optgroup label="Favorites ★">
                        {vault.items.filter((x) => x.favorite && x.id !== item.id).map((it) => (
                          <option key={`fav-${it.id}`} value={it.id}>★ {it.name} ({it.game})</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All Vault Designs">
                      {vault.items.filter((x) => x.id !== item.id).map((it) => (
                        <option key={`all-${it.id}`} value={it.id}>{it.name} ({it.game})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>
            <div className="mono muted small">{item.width}x{item.height} · {resolutionTag(item.width, item.height)} · {item.game}</div>
          </div>

          <div className="vp-head-right">
            {compositeLive && (
              <div className="note composite-note mono" style={{ margin: 0, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                ▣ A layered composite is currently live. <button className="linkbtn" onClick={stopComposite}>Switch to this single overlay</button>
              </div>
            )}
            <div className="vp-quick-actions">
              <button type="button" className={`btn small ${snapEnabled ? "primary" : "outline"}`} onClick={() => setSnapEnabled(!snapEnabled)} title="Snap to monitor center and edges when dragging near them (Hold Alt to bypass)">
                {snapEnabled ? "✓ Center Snapping" : "Snapping Off"}
              </button>
              <button type="button" className={`btn small ${grid10 ? "primary" : "outline"}`} onClick={() => setGrid10(!grid10)} title="Drag and nudge in 10px increments (or hold Shift while dragging)">
                {grid10 ? "✓ 10px Grid Active" : "10px Grid Snap"}
              </button>
              <button type="button" className="btn small outline" onClick={fitScreen} title="Fit overlay entirely inside your monitor">Fit Screen</button>
              <button type="button" className="btn small outline" onClick={native1to1} title="Reset overlay scale to 1:1 original native size">1:1 Native</button>
              <button type="button" className="btn small outline" onClick={snapCenter} title="Center overlay horizontally and vertically (X:0, Y:0)">Center</button>
            </div>
          </div>
        </div>

        <div className="stage-container">
          <div
            ref={box}
            className="stage bracket bd-grid"
            style={{
              aspectRatio: `${mw} / ${mh}`,
              width: "100%",
              maxWidth: `calc(50vh * (${mw} / ${mh}))`,
              maxHeight: "50vh",
            }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
              flash();
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              let rawX = d.x + (e.clientX - d.px) / k, rawY = d.y + (e.clientY - d.py) / k;
              let gx: number | null = null, gy: number | null = null;
              const labels: string[] = [];

              if (grid10 || e.shiftKey) {
                rawX = Math.round(rawX / 10) * 10;
                rawY = Math.round(rawY / 10) * 10;
                labels.push("10px GRID");
              }
              if (snapEnabled && !e.altKey) {
                const snapDist = 14;
                const leftSnap = -mw / 2 + bw / 2, rightSnap = mw / 2 - bw / 2;
                if (Math.abs(rawX) <= snapDist) { rawX = 0; gx = mw / 2; labels.push("CENTER X"); }
                else if (Math.abs(rawX - leftSnap) <= snapDist) { rawX = leftSnap; gx = 0; labels.push("LEFT EDGE"); }
                else if (Math.abs(rawX - rightSnap) <= snapDist) { rawX = rightSnap; gx = mw; labels.push("RIGHT EDGE"); }

                const topSnap = -mh / 2 + bh / 2, bottomSnap = mh / 2 - bh / 2;
                if (Math.abs(rawY) <= snapDist) { rawY = 0; gy = mh / 2; labels.push("CENTER Y"); }
                else if (Math.abs(rawY - topSnap) <= snapDist) { rawY = topSnap; gy = 0; labels.push("TOP EDGE"); }
                else if (Math.abs(rawY - bottomSnap) <= snapDist) { rawY = bottomSnap; gy = mh; labels.push("BOTTOM EDGE"); }
              }

              setGuides({ gx, gy });
              setSnapBadge(labels.join(" · "));
              patch({ x: Math.round(rawX), y: Math.round(rawY) });
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {guides.gx !== null && <div className="guide v" style={{ left: `${(guides.gx / mw) * 100}%` }} />}
            {guides.gy !== null && <div className="guide h" style={{ top: `${(guides.gy / mh) * 100}%` }} />}
            {snapBadge && <div className="guide-badge mono">{snapBadge}</div>}

            <OverlayLayer src={src} imgW={item.width} imgH={item.height} t={t} monitorW={mw} monitorH={mh} k={k}>
              {adjusting && <div className="bbox" style={{ left: mw / 2 + t.x - bw / 2, top: mh / 2 + t.y - bh / 2, width: bw, height: bh, outlineWidth: 1 / k }} />}
            </OverlayLayer>
            {adjusting && (
              <>
                <div className="xhair v" />
                <div className="xhair h" />
                <div className="readout mono">X {Math.round(t.x)} · Y {Math.round(t.y)} · {t.scale.toFixed(1)}%</div>
              </>
            )}
            <div className="stage-tag mono">{mon ? monitorLabel(mon) : "Display"}</div>
          </div>
        </div>
        <div className="muted small tip-caption">
          Tip: Drag inside preview to reposition • Hold <span className="mono" style={{ color: "var(--cyan)" }}>Shift</span> for 10px snap • Hold <span className="mono" style={{ color: "var(--pink)" }}>Alt</span> for free drag • Visual guides snap to monitor center &amp; edges.
        </div>
      </section>

      <div className="display-deck">
        <section className="card bracket deck-col">
          <div className="panel-title"><span>Overlay Status &amp; Target</span></div>
          <div className="deck-col-content">
            <div className="master">
              <div>
                <div className="master-title">Enable Overlay on Screen</div>
                <div className={`mono small ${status.visible ? "ok" : "muted"}`}>
                  {status.visible
                    ? status.activeGame
                      ? `● PROJECTING (${status.activeGame.toUpperCase()})`
                      : "● PROJECTING"
                    : overlay.enabled
                    ? status.activeGame
                      ? `○ WAITING (${status.activeGame.toUpperCase()})`
                      : "○ WAITING FOR GAME"
                    : "○ OFF"}
                </div>
              </div>
              <Toggle
                large
                checked={overlay.enabled}
                onChange={(v) => {
                  setOverlay((o) => ({ ...o, enabled: v }));
                  if (v && (settings?.targetMode === "game" || settings?.targetMode === "smart_detect") && !status.gameRunning) {
                    saveSettings?.({ targetMode: "force_on_screen" });
                  }
                }}
              />
            </div>

            <div className="display-mode-card" style={{ marginTop: 8, padding: 10, background: "#0c0d18", border: "1px solid var(--border)", borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="mono bold small" style={{ color: "var(--cyan)" }}>Display Target Mode</span>
                <span className={`tag mono ${settings?.targetMode !== "game" && settings?.targetMode !== "smart_detect" ? "ok" : ""}`} style={{ fontSize: 10 }}>
                  {settings?.targetMode !== "game" && settings?.targetMode !== "smart_detect" ? "ALWAYS VISIBLE" : "AUTO-DETECT"}
                </span>
              </div>
              <div className="seg full" style={{ display: "flex", width: "100%" }}>
                <button
                  type="button"
                  className={settings?.targetMode !== "game" && settings?.targetMode !== "smart_detect" ? "active" : ""}
                  onClick={() => saveSettings?.({ targetMode: "force_on_screen" })}
                  title="Keep overlay projected at all times over desktop and any game"
                >
                  Force on Screen
                </button>
                <button
                  type="button"
                  className={settings?.targetMode === "game" || settings?.targetMode === "smart_detect" ? "active" : ""}
                  onClick={() => saveSettings?.({ targetMode: "smart_detect" })}
                  title="Automatically show overlay when a detected or enabled game is running"
                >
                  Smart Game Detect
                </button>
              </div>
              {(settings?.targetMode === "game" || settings?.targetMode === "smart_detect") && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  {status.activeGame ? (
                    <span className="mono mini ok" style={{ color: "var(--cyan)" }}>● Active: {status.activeGame}</span>
                  ) : (
                    <span className="mono mini warn" style={{ color: "var(--gold)" }}>○ Waiting for game...</span>
                  )}
                  {goSettings ? (
                    <button type="button" className="btn outline small" style={{ padding: "3px 10px", fontSize: 11 }} onClick={goSettings}>
                      Target Games ({settings?.smartDetectAll !== false ? "124 Games" : `${settings?.enabledGameIds?.length ?? 0} Selected`})
                    </button>
                  ) : (
                    <button type="button" className="btn primary small" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => saveSettings?.({ targetMode: "force_on_screen" })}>
                      Force Show Now
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Target Monitor</label>
              <select className="input full" value={overlay.monitor} onChange={(e) => setOverlay((o) => ({ ...o, monitor: Number(e.target.value) }))}>
                {monitors.map((m) => <option key={m.index} value={m.index}>{monitorLabel(m)}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="card bracket deck-col">
          <div className="panel-title"><span>Transform &amp; Alignment</span></div>
          <div className="deck-col-content">
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
                  {[1, 5, 10, 25, 50].map((s) => <option key={s} value={s}>{s} px</option>)}
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
                <button className="btn small outline" onClick={snapCenter}>Snap Center</button>
                <button className="btn small outline" onClick={roundTo10}>Round 10px</button>
                <button className="btn small outline" onClick={fitScreen}>Fit Screen</button>
                <button className="btn small outline" onClick={fillScreen}>Fill Screen</button>
              </div>
            </div>
          </div>
        </section>

        <section className="card bracket deck-col">
          <div className="panel-title"><span>Color &amp; Visual Tweaks</span></div>
          <div className="deck-col-content">
            <div
              className="rainbow-card"
              style={{
                marginBottom: 14, padding: 12,
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
                    <div className="bold" style={{ fontSize: 13, color: t.chromaCycle ? "var(--pink)" : "var(--text)" }}>Animated Rainbow / Chroma Cycle</div>
                    <div className="mono mini muted" style={{ fontSize: 10 }}>360° animated spectrum cycling · 0% CPU cost</div>
                  </div>
                </div>
                <Toggle checked={Boolean(t.chromaCycle)} onChange={(v) => patch({ chromaCycle: v })} />
              </div>

              {t.chromaCycle && (
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                  <SliderRow label="Cycle Speed" value={t.chromaSpeed || 6} min={1} max={25} suffix="s" onChange={(v) => patch({ chromaSpeed: v })} />
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
                  {HUE_SWATCHES.map((s) => (
                    <button
                      key={s.color}
                      type="button"
                      className={`swatch-btn${Math.abs(t.hue - s.hue) < 5 ? " active" : ""}`}
                      style={{ backgroundColor: s.color, color: s.color }}
                      title={`${s.label} (${s.hue}°)`}
                      onClick={() => patch({ hue: s.hue })}
                    />
                  ))}
                  <button type="button" className="swatch-btn swatch-reset" title="Reset color tint to original asset colors" onClick={() => patch({ hue: 0, brightness: 100, contrast: 100 })}>
                    Reset
                  </button>
                </div>
              }
            />
            <SliderRow label="Brightness" value={t.brightness} min={50} max={150} suffix="%" onChange={(v) => patch({ brightness: clamp(v, 0, 300) })} />
            <SliderRow label="Contrast" value={t.contrast} min={50} max={150} suffix="%" onChange={(v) => patch({ contrast: clamp(v, 0, 300) })} />
          </div>

          <div className="btn-row stick" style={{ marginTop: "auto", paddingTop: 10 }}>
            <button className="btn primary grow" onClick={async () => { setVault(await api.updateItem(item.id, { transform: t })); setSaved(true); }}>
              {saved ? "✓ Profile Saved" : "Save Profile to Vault Item"}
            </button>
            <button className="btn outline" title="Reset to saved calibration (or defaults)" onClick={() => patch({ ...(item.transform ?? DEFAULT_TRANSFORM) })}>
              Reset
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
