import { useEffect, useMemo, useState } from "react";
import { api, assetUrl } from "../api";
import {
  ELEMENT_TAGS,
  GAME_EXES,
  KNOWN_GAMES,
  ROLES,
  type CompositePreset,
  type Settings,
  type UpdateStatus,
  type VaultData,
  type VaultItem,
} from "../types";
import { computeFavoriteOverlay, formatDuration, type UsageStats } from "../usage";
import { gameClass } from "../util";
import { StackThumb } from "./SceneView";
import { Toggle } from "./ui";

function keyName(e: KeyboardEvent): string | null {
  const k = e.key;
  if (/^F\d{1,2}$/.test(k)) return k;
  if (/^[a-z0-9]$/i.test(k)) return k.toUpperCase();
  if (k.startsWith("Arrow")) return k.slice(5);
  if (k === " ") return "Space";
  if (["Home", "End", "PageUp", "PageDown", "Insert"].includes(k)) return k;
  return null;
}

function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      if (e.key === "Escape") return setRec(false);
      if (e.key === "Backspace" || e.key === "Delete") {
        onChange("");
        return setRec(false);
      }
      const k = keyName(e);
      if (!k) return;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
      onChange([...mods, k].join("+"));
      setRec(false);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [rec, onChange]);
  return (
    <button className={`hotkey mono${rec ? " rec" : ""}`} onClick={() => setRec(true)} onBlur={() => setRec(false)}>
      {rec ? "Press keys... (Esc cancel, Del clear)" : value || "Unbound"}
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div>
        <div className="row-title">{title}</div>
        {desc && <div className="muted small">{desc}</div>}
      </div>
      <div className="row-ctl">{children}</div>
    </div>
  );
}

export function SettingsView({
  settings: s,
  save,
  currentForegroundExe,
  vault,
  usageStats,
  activeOverlayItemId,
  isTelemetryPaused,
  onToggleTelemetry,
  onResetTelemetry,
  onEquipItem,
  onEquipPreset,
  updateStatus = { status: "idle" },
  onCheckUpdate,
  onDownloadUpdate,
  onRestartUpdate,
}: {
  settings: Settings;
  save: (p: Partial<Settings>) => void;
  currentForegroundExe?: string | null;
  vault?: VaultData | null;
  usageStats?: UsageStats;
  activeOverlayItemId?: string | null;
  isTelemetryPaused?: boolean;
  onToggleTelemetry?: () => void;
  onResetTelemetry?: () => void;
  onEquipItem?: (item: VaultItem) => void;
  onEquipPreset?: (preset: CompositePreset) => void;
  updateStatus?: UpdateStatus;
  onCheckUpdate?: () => void;
  onDownloadUpdate?: () => void;
  onRestartUpdate?: () => void;
}) {
  const [exe, setExe] = useState(s.targetExe);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isGameActive = !!currentForegroundExe && KNOWN_GAMES.some((g) =>
    g.exes.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase())
  );

  const favOverlay = computeFavoriteOverlay(vault, usageStats, activeOverlayItemId);
  const effectiveUploads = Math.max(usageStats?.totalUploads ?? 0, vault?.items.length ?? 0);
  const vaultItemCount = vault?.items.length ?? 0;
  const estimatedSizeMB = vault && vault.items.length > 0
    ? (vault.items.reduce((acc, it) => acc + (it.width * it.height * 0.4) / (1024 * 1024), 0)).toFixed(1)
    : "0";

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3500);
    } else {
      setConfirmReset(false);
      onResetTelemetry?.();
    }
  };

  const gameBreakdown = useMemo(() => {
    if (!vault) return { segments: [] as Array<{ game: string; percent: number; detail: string; color: string }>, modeLabel: "no data" };

    const times = usageStats?.overlayTime ?? {};
    const gameTimes: Record<string, number> = {};
    let totalTime = 0;

    for (const it of vault.items) {
      const t = times[it.id] ?? 0;
      const g = it.game || "Other";
      if (t > 0) {
        gameTimes[g] = (gameTimes[g] || 0) + t;
        totalTime += t;
      }
    }

    for (const p of vault.presets) {
      const t = times[`preset:${p.id}`] ?? times[p.id] ?? 0;
      const g = p.game || "Other";
      if (t > 0) {
        gameTimes[g] = (gameTimes[g] || 0) + t;
        totalTime += t;
      }
    }

    const GAME_COLORS: Record<string, string> = {
      Overwatch: "#38bdf8",
      Valorant: "#f43f5e",
      "Marvel Rivals": "#a855f7",
      "Call of Duty": "#eab308",
      Fortnite: "#10b981",
      "Apex Legends": "#fb923c",
      "Dead by Daylight": "#64748b",
      Other: "#06b6d4",
    };
    const PALETTE = ["#38bdf8", "#a855f7", "#f43f5e", "#10b981", "#eab308", "#fb923c", "#06b6d4", "#64748b"];

    if (totalTime > 0) {
      const sorted = Object.entries(gameTimes).sort((a, b) => b[1] - a[1]);
      const segments = sorted.map(([game, sec], i) => ({
        game,
        percent: Math.max(1, Math.round((sec / totalTime) * 100)),
        detail: formatDuration(sec),
        color: GAME_COLORS[game] || PALETTE[i % PALETTE.length],
      }));
      return { segments, modeLabel: "by active time" };
    }

    // Fallback to library distribution by game
    const gameCounts: Record<string, number> = {};
    let totalCount = 0;
    for (const it of vault.items) {
      const g = it.game || "Other";
      gameCounts[g] = (gameCounts[g] || 0) + 1;
      totalCount++;
    }
    for (const p of vault.presets) {
      const g = p.game || "Other";
      gameCounts[g] = (gameCounts[g] || 0) + 1;
      totalCount++;
    }

    if (totalCount > 0) {
      const sorted = Object.entries(gameCounts).sort((a, b) => b[1] - a[1]);
      const segments = sorted.map(([game, count], i) => ({
        game,
        percent: Math.max(1, Math.round((count / totalCount) * 100)),
        detail: `${count} ${count === 1 ? "overlay" : "overlays"}`,
        color: GAME_COLORS[game] || PALETTE[i % PALETTE.length],
      }));
      return { segments, modeLabel: "by library distribution" };
    }

    return { segments: [], modeLabel: "no activity" };
  }, [vault, usageStats]);

  return (
    <div className="page settings">
      {/* 1. Primary Overlay Display & Game Targeting */}
      <section className="card bracket">
        <h3>Overlay Display &amp; Game Targeting</h3>
        <Row
          title="Target Mode"
          desc="Always-on-top desktop overlay, or auto-attach (show overlay only while target game is focused)."
        >
          <div className="seg">
            <button className={s.targetMode === "topmost" ? "active" : ""} onClick={() => save({ targetMode: "topmost" })}>Always on Top</button>
            <button className={s.targetMode === "game" ? "active" : ""} onClick={() => save({ targetMode: "game" })}>Auto-Attach to Game</button>
          </div>
        </Row>
        {s.targetMode === "game" && (
          <Row title="Game Executable" desc="Overlay appears only while this process is running.">
            <div className="exe">
              <select
                className="input"
                value={GAME_EXES.some((g) => g.exe === s.targetExe) ? s.targetExe : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    setExe(e.target.value);
                    save({ targetExe: e.target.value });
                  }
                }}
              >
                <option value="">Custom...</option>
                {GAME_EXES.map((g) => <option key={g.exe} value={g.exe}>{g.label}</option>)}
              </select>
              <input
                className="input mono"
                value={exe}
                onChange={(e) => setExe(e.target.value)}
                onBlur={() => exe.trim() && exe !== s.targetExe && save({ targetExe: exe.trim() })}
                placeholder="Game.exe"
              />
            </div>
          </Row>
        )}
        <Row
          title="Hide from Capture (OBS / Stream Mode)"
          desc="ON: Only you see the overlay on your screen (WDA_EXCLUDEFROMCAPTURE). OFF: Overlay also appears in OBS Game and Display capture."
        >
          <Toggle checked={s.hideFromCapture} onChange={(v) => save({ hideFromCapture: v })} />
        </Row>
        <Row
          title="Automatic Game Detection"
          desc="Detects foreground game processes (Overwatch, Valorant, Marvel Rivals) and auto-switches to matching loadouts."
        >
          <Toggle checked={s.autoGameSwitch ?? true} onChange={(v) => save({ autoGameSwitch: v })} />
        </Row>
        <Row
          title="Auto-Hide when Tabbed Out"
          desc="Conceals overlay when tabbed into Discord, Chrome, or Desktop; reappears instantly when you focus back on the game."
        >
          <Toggle checked={s.autoHideUnfocused ?? false} onChange={(v) => save({ autoHideUnfocused: v })} />
        </Row>
        <Row
          title="Focused Foreground Process"
          desc="Live hardware readout of the currently focused Windows application."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono small" style={{ color: "var(--cyan)" }}>
              {currentForegroundExe || "desktop / idle"}
            </span>
            <span className={`tag mono ${isGameActive ? "ok" : ""}`}>
              {isGameActive ? "● GAME DETECTED" : "○ BACKGROUND"}
            </span>
          </div>
        </Row>
      </section>

      {/* 2. Game-to-HUD Profiles */}
      {vault && (
        <section className="card bracket">
          <h3>Game-to-HUD Profile Assignments</h3>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Automatically load a specific Vault Overlay or Layering Loadout when a supported game is launched.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {KNOWN_GAMES.map((g) => {
              const profiles = s.gameProfiles ?? {};
              const currentVal = profiles[g.name] || "";
              return (
                <div key={g.name} className="card bracket" style={{ padding: 10, background: "#0c0d17" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="mono bold small" style={{ color: g.color }}>{g.label}</span>
                    <span className="mono muted mini">{g.exes[0]}</span>
                  </div>
                  <select
                    className="input full"
                    value={currentVal}
                    onChange={(e) => {
                      const next = { ...profiles };
                      if (e.target.value) next[g.name] = e.target.value;
                      else delete next[g.name];
                      save({ gameProfiles: next });
                    }}
                  >
                    <option value="">Automatic (First Favorite / Matching HUD)</option>
                    {vault.presets.filter((p) => p.game === g.name || !p.game).length > 0 && (
                      <optgroup label="Layer Presets">
                        {vault.presets.map((p) => (
                          <option key={`preset:${p.id}`} value={`preset:${p.id}`}>
                            ★ Loadout: {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Vault Overlays">
                      {vault.items
                        .filter((it) => it.game === g.name || it.game === "Other")
                        .map((it) => (
                          <option key={`item:${it.id}`} value={`item:${it.id}`}>
                            {it.favorite ? "★ " : ""}{it.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Global Hotkeys */}
      <section className="card bracket">
        <h3>Global Hotkeys</h3>
        <Row title="Toggle Overlay Visibility" desc="Show / hide the active overlay."><HotkeyInput value={s.hotkeyToggle} onChange={(v) => save({ hotkeyToggle: v })} /></Row>
        <Row title="Next Overlay" desc="Cycles overlays in the current Vault folder filter."><HotkeyInput value={s.hotkeyNext} onChange={(v) => save({ hotkeyNext: v })} /></Row>
        <Row title="Previous Overlay"><HotkeyInput value={s.hotkeyPrev} onChange={(v) => save({ hotkeyPrev: v })} /></Row>
      </section>

      {/* 4. Layer Role Hotkeys */}
      <section className="card bracket">
        <h3>Layer Role Hotkeys</h3>
        <div className="muted small" style={{ marginBottom: 8 }}>
          Toggle individual HUD parts in the Layering stack (e.g. Map Overlay on <span className="mono">Ctrl+Alt+M</span>).
        </div>
        {ROLES.map((r) => (
          <Row key={r.id} title={r.label} desc={`Toggles all ${r.badge} layers.`}>
            <HotkeyInput
              value={s.layerHotkeys?.[r.id] ?? ""}
              onChange={(v) => {
                const next = { ...(s.layerHotkeys ?? {}) };
                if (v) next[r.id] = v;
                else delete next[r.id];
                save({ layerHotkeys: next });
              }}
            />
          </Row>
        ))}
      </section>

      {/* 5. Iris Usage & Activity */}
      <section className="card bracket telemetry-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Iris Usage &amp; Activity</h3>
          <div className="telemetry-header-controls">
            <button
              type="button"
              className={`telemetry-status-pill ${!isTelemetryPaused ? "live" : "paused"}`}
              onClick={() => onToggleTelemetry?.()}
              title={!isTelemetryPaused ? "Click to pause telemetry tracking" : "Click to resume telemetry tracking"}
            >
              <span className="telemetry-pulse-dot" />
              {!isTelemetryPaused ? "TRACKING ACTIVE" : "TRACKING PAUSED"}
            </button>
            <button
              type="button"
              className={`btn small ${confirmReset ? "danger" : "outline"} telemetry-reset-btn`}
              onClick={handleResetClick}
              title={confirmReset ? "Click again to confirm resetting all usage telemetry" : "Reset session and usage counters"}
            >
              {confirmReset ? "Confirm Reset?" : "↺ Reset"}
            </button>
          </div>
        </div>
        <div className="muted small" style={{ marginBottom: 14 }}>
          Live overlay and session telemetry tracking your Iris usage across games and presets.
        </div>

        {/* Bento 2-Column Grid */}
        <div className="telemetry-bento-grid">
          {/* Left Column: Top Equipped Overlay Hero Card */}
          <div className="bento-cell telemetry-hero-card">
            <div className="telemetry-hero-head">
              <span className="bento-label">TOP EQUIPPED OVERLAY</span>
              {favOverlay.isStarred && (
                <span className="telemetry-badge star" style={{ color: "#fbbf24", background: "rgba(251, 191, 36, 0.12)", border: "1px solid rgba(251, 191, 36, 0.35)" }}>
                  ★ FAVORITE
                </span>
              )}
            </div>

            {favOverlay.item && vault ? (
              <div className="telemetry-hero-thumb">
                <div className="telemetry-hero-glow" />
                <img
                  src={assetUrl(favOverlay.item.thumb ? vault.thumbsDir : vault.assetsDir, favOverlay.item.thumb ?? favOverlay.item.file)}
                  alt={favOverlay.item.name}
                  className="telemetry-hero-img"
                />
                <div className="telemetry-equip-overlay">
                  <button
                    type="button"
                    className="btn small primary telemetry-equip-btn"
                    onClick={() => onEquipItem?.(favOverlay.item!)}
                  >
                    ⚡ Equip Now
                  </button>
                </div>
              </div>
            ) : favOverlay.preset && vault ? (
              <div className="telemetry-hero-thumb">
                <div className="telemetry-hero-glow" />
                <div style={{ width: "85%", height: "85%", position: "relative", zIndex: 1 }}>
                  <StackThumb
                    layers={favOverlay.preset.layers}
                    vault={vault}
                    refW={favOverlay.preset.refW}
                    refH={favOverlay.preset.refH}
                  />
                </div>
                <div className="telemetry-equip-overlay">
                  <button
                    type="button"
                    className="btn small primary telemetry-equip-btn"
                    onClick={() => onEquipPreset?.(favOverlay.preset!)}
                  >
                    ⚡ Equip Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="telemetry-hero-thumb empty">
                <div className="muted small" style={{ textAlign: "center", padding: 16 }}>
                  No overlays in Vault
                </div>
              </div>
            )}

            <div className="telemetry-hero-details">
              <div className="telemetry-hero-name-row">
                <div className="telemetry-hero-name" title={favOverlay.name}>
                  {favOverlay.name}
                </div>
                {favOverlay.isRecentFallback || favOverlay.timeSeconds === 0 ? (
                  <span className="telemetry-badge recent">Recently Added</span>
                ) : (
                  <span className="telemetry-badge active-time">⏱ {favOverlay.timeFormatted}</span>
                )}
              </div>
              <div className="telemetry-hero-meta">
                {favOverlay.sub && (
                  <span className={`tag mono ${gameClass(favOverlay.sub)}`}>
                    {favOverlay.sub}
                  </span>
                )}
                {favOverlay.tag && (
                  <span className="tag mono">
                    {ELEMENT_TAGS.find((t) => t.id === favOverlay.tag)?.label || favOverlay.tag}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Unified Telemetry Strip + Game Distribution Bar */}
          <div className="telemetry-right-col">
            {/* Top Row: 3 Compact Stat Cells */}
            <div className="telemetry-stat-strip">
              {/* 1. Vault Library */}
              <div className="bento-cell telemetry-stat-cell">
                <div className="bento-label">VAULT LIBRARY</div>
                <div className="bento-value">{effectiveUploads}</div>
                <div className="bento-sub">
                  {vaultItemCount} {vaultItemCount === 1 ? "overlay" : "overlays"}
                  {estimatedSizeMB && estimatedSizeMB !== "0" ? ` · ~${estimatedSizeMB} MB` : ""}
                </div>
              </div>

              {/* 2. Overlays Swapped */}
              <div className="bento-cell telemetry-stat-cell">
                <div className="bento-label">OVERLAYS SWAPPED</div>
                <div className="bento-value">{usageStats?.totalSwaps ?? 0}</div>
                <div className="bento-sub">Switches &amp; cyclers</div>
              </div>

              {/* 3. Active HUD Time */}
              <div className="bento-cell telemetry-stat-cell">
                <div className="bento-label">ACTIVE HUD TIME</div>
                <div className="bento-value">{formatDuration(usageStats?.totalAppTimeSeconds ?? 0)}</div>
                <div className="bento-sub">Lifetime Iris usage</div>
              </div>
            </div>

            {/* Bottom Row: Game Activity Breakdown Bar */}
            <div className="bento-cell telemetry-breakdown-card">
              <div className="telemetry-breakdown-head">
                <span className="bento-label">GAME ACTIVITY BREAKDOWN</span>
                <span className="mono muted small">{gameBreakdown.modeLabel}</span>
              </div>

              <div className="telemetry-progress-track">
                {gameBreakdown.segments.map((seg) => (
                  <div
                    key={seg.game}
                    className="telemetry-segment"
                    style={{ width: `${seg.percent}%`, backgroundColor: seg.color }}
                    title={`${seg.game}: ${seg.percent}% (${seg.detail})`}
                  />
                ))}
                {gameBreakdown.segments.length === 0 && (
                  <div className="telemetry-segment-empty" style={{ width: "100%" }} />
                )}
              </div>

              <div className="telemetry-legend">
                {gameBreakdown.segments.map((seg) => (
                  <div key={seg.game} className="telemetry-legend-item">
                    <span className="telemetry-dot" style={{ backgroundColor: seg.color }} />
                    <span className="telemetry-legend-name">{seg.game}</span>
                    <span className="telemetry-legend-pct mono">{seg.percent}%</span>
                  </div>
                ))}
                {gameBreakdown.segments.length === 0 && (
                  <span className="muted small">No game activity recorded yet</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. System & Storage */}
      <section className="card bracket">
        <h3>System &amp; Storage</h3>
        <Row title="Start minimized to tray on Windows boot" desc="Registers Iris in HKCU\...\Run with --minimized.">
          <Toggle checked={s.startWithWindows} onChange={(v) => save({ startWithWindows: v })} />
        </Row>
        <Row title="Close button minimizes to tray" desc="Keeps the overlay and hotkeys alive. Use the tray icon to quit.">
          <Toggle checked={s.closeToTray} onChange={(v) => save({ closeToTray: v })} />
        </Row>
        <Row title="Hardware Acceleration" desc="GPU-composited rendering. Requires restart.">
          <Toggle checked={s.hardwareAcceleration} onChange={(v) => { setNeedsRestart(true); save({ hardwareAcceleration: v }); }} />
        </Row>
        <Row title="Low-Resource Mode" desc="Disables color filters on the overlay and slows background process polling.">
          <Toggle checked={s.lowResource} onChange={(v) => save({ lowResource: v })} />
        </Row>
        {needsRestart && <div className="note mono">&#x21BB; Restart Iris to apply the hardware acceleration change.</div>}
        <Row title="Local Vault Directory" desc="PNG assets, thumbnails, vault_manifest.json and settings.json.">
          <button className="btn outline" onClick={() => api.openVaultDir()}>Open Vault Directory</button>
        </Row>
      </section>

      {/* 7. Updates & Release Maintenance */}
      <section className="card bracket">
        <h3>Updates &amp; Release Maintenance</h3>
        <Row
          title="App Version &amp; Repository"
          desc="Iris Desktop Overlay utility releases are distributed via GitHub Releases."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="mono bold" style={{ color: "var(--cyan)" }}>Iris v0.1.0</span>
            <a
              href="https://github.com/allnighter51/Iris"
              target="_blank"
              rel="noreferrer"
              className="tag mono"
              style={{ textDecoration: "none", cursor: "pointer" }}
            >
              github.com/allnighter51/Iris
            </a>
          </div>
        </Row>
        <Row
          title="Check for updates on app startup"
          desc="Silently checks GitHub Releases in the background. Does not interrupt or steal focus while playing or streaming."
        >
          <Toggle
            checked={s.checkUpdatesOnStartup ?? true}
            onChange={(v) => save({ checkUpdatesOnStartup: v })}
          />
        </Row>
        <Row
          title="Update Status"
          desc="Current status of the official Tauri auto-updater."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {updateStatus.status === "idle" && (
              <span className="tag mono">○ STANDBY</span>
            )}
            {updateStatus.status === "checking" && (
              <span className="tag mono" style={{ color: "var(--cyan)" }}>⟳ CHECKING GITHUB RELEASES...</span>
            )}
            {updateStatus.status === "upToDate" && (
              <span className="tag mono ok">● UP TO DATE (v{updateStatus.currentVersion})</span>
            )}
            {updateStatus.status === "available" && (
              <span className="tag mono" style={{ color: "var(--cyan)", borderColor: "var(--cyan)" }}>
                ★ UPDATE AVAILABLE: v{updateStatus.version}
              </span>
            )}
            {updateStatus.status === "downloading" && (
              <span className="tag mono" style={{ color: "var(--purple)", borderColor: "var(--purple)" }}>
                ↓ DOWNLOADING {updateStatus.progress.toFixed(0)}%
                {updateStatus.total ? ` (${(updateStatus.downloaded / (1024 * 1024)).toFixed(1)} / ${(updateStatus.total / (1024 * 1024)).toFixed(1)} MB)` : ""}
              </span>
            )}
            {updateStatus.status === "downloaded" && (
              <span className="tag mono ok" style={{ borderColor: "var(--emerald)" }}>
                ✓ UPDATE READY TO INSTALL (v{updateStatus.version})
              </span>
            )}
            {updateStatus.status === "error" && (
              <span className="tag mono" style={{ color: "#f87171", borderColor: "#f87171" }} title={updateStatus.message}>
                ⚠ {updateStatus.message.length > 50 ? `${updateStatus.message.slice(0, 50)}...` : updateStatus.message}
              </span>
            )}
          </div>
        </Row>

        {updateStatus.status === "available" && updateStatus.body && (
          <div style={{ margin: "10px 0", padding: "10px", background: "#0a0b12", borderRadius: 4, border: "1px solid var(--border)" }}>
            <div className="mono small bold" style={{ color: "var(--cyan)", marginBottom: 4 }}>Release Notes (v{updateStatus.version})</div>
            <div className="small muted" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>{updateStatus.body}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            className="btn outline"
            disabled={updateStatus.status === "checking" || updateStatus.status === "downloading"}
            onClick={onCheckUpdate}
          >
            {updateStatus.status === "checking" ? "Checking..." : "Check for Updates"}
          </button>

          {updateStatus.status === "available" && (
            <button className="btn primary" onClick={onDownloadUpdate}>
              Download in Background
            </button>
          )}

          {updateStatus.status === "downloaded" && (
            <button className="btn primary" onClick={onRestartUpdate}>
              Restart &amp; Update Now
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
