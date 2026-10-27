import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, assetUrl } from "../api";
import { ELEMENT_TAGS, GAME_EXES, KNOWN_GAMES, ROLES, type CompositePreset, type Settings, type UpdateStatus, type VaultData, type VaultItem } from "../types";
import { computeFavoriteOverlay, formatDuration, type UsageStats } from "../usage";
import { gameClass } from "../util";
import { StackThumb } from "./SceneView";
import { Toggle } from "./ui";

export type SettingsTab = "display" | "profiles" | "keybinds" | "telemetry" | "system";

const NAV_ICONS: Record<SettingsTab, ReactNode> = {
  display: <><circle cx="12" cy="12" r="10" /><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" /></>,
  profiles: <><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" /><rect x="2" y="6" width="20" height="12" rx="2" /></>,
  keybinds: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M6 12h.001M10 12h.001M14 12h.001M18 12h.001M8 16h8" /></>,
  telemetry: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  system: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
};

const SETTINGS_NAV: { id: SettingsTab; label: string }[] = [
  { id: "display", label: "Display & Targeting" },
  { id: "profiles", label: "Game Profiles" },
  { id: "keybinds", label: "Keybinds" },
  { id: "telemetry", label: "Telemetry" },
  { id: "system", label: "System & Updates" },
];

const GAME_COLORS: Record<string, string> = {
  Overwatch: "#38bdf8", Valorant: "#f43f5e", "Marvel Rivals": "#a855f7", "Call of Duty": "#eab308",
  Fortnite: "#10b981", "Apex Legends": "#fb923c", "Dead by Daylight": "#64748b", Other: "#06b6d4",
};
const PALETTE = ["#38bdf8", "#a855f7", "#f43f5e", "#10b981", "#eab308", "#fb923c", "#06b6d4", "#64748b"];

function keyName(e: KeyboardEvent): string | null {
  const k = e.key;
  if (/^F\d{1,2}$/.test(k)) return k;
  if (/^[a-z0-9]$/i.test(k)) return k.toUpperCase();
  if (k.startsWith("Arrow")) return k.slice(5);
  if (k === " ") return "Space";
  return ["Home", "End", "PageUp", "PageDown", "Insert"].includes(k) ? k : null;
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
      if (e.key === "Backspace" || e.key === "Delete") { onChange(""); return setRec(false); }
      const k = keyName(e);
      if (!k) return;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
      onChange([...mods, k].join("+"));
      setRec(false);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [rec, onChange]);

  if (rec) {
    return (
      <button type="button" className="keycap-rec" onClick={() => setRec(false)} title="Press your key combination or press Esc to cancel">
        <span className="keycap-rec-dot" /> Press key combo... (Esc cancel)
      </button>
    );
  }
  if (!value) {
    return (
      <button type="button" className="keycap-unbound" onClick={() => setRec(true)} title="Click to record keybind">
        <span className="keycap-plus">+</span> Click to bind
      </button>
    );
  }
  const keys = value.split("+");
  return (
    <div className="keycap-group" onClick={() => setRec(true)} title="Click to re-record keybind">
      <div className="keycaps-wrapper">
        {keys.map((k, idx) => (
          <span key={idx} className="keycap-item">
            <kbd className="keycap">{k}</kbd>
            {idx < keys.length - 1 && <span className="keycap-plus">+</span>}
          </span>
        ))}
      </div>
      <button type="button" className="keycap-clear-btn" title="Clear keybind" onClick={(e) => { e.stopPropagation(); onChange(""); }}>×</button>
    </div>
  );
}

function SettingsRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-title">{title}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-ctrl">{children}</div>
    </div>
  );
}

interface SettingsProps {
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
}

export function SettingsView({
  settings: s, save, currentForegroundExe, vault, usageStats, activeOverlayItemId,
  isTelemetryPaused, onToggleTelemetry, onResetTelemetry, onEquipItem, onEquipPreset,
  updateStatus = { status: "idle" }, onCheckUpdate, onDownloadUpdate, onRestartUpdate,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("display");
  const [exe, setExe] = useState(s.targetExe);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isGameActive = !!currentForegroundExe && KNOWN_GAMES.some((g) => g.exes.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase()));
  const favOverlay = computeFavoriteOverlay(vault, usageStats, activeOverlayItemId);
  const vaultItemCount = vault?.items.length ?? 0;
  const effectiveUploads = Math.max(usageStats?.totalUploads ?? 0, vaultItemCount);
  const estimatedSizeMB = vault && vaultItemCount > 0
    ? vault.items.reduce((acc, it) => acc + (it.width * it.height * 0.4) / (1024 * 1024), 0).toFixed(1)
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
    const gameCounts: Record<string, number> = {};
    let totalTime = 0, totalCount = 0;

    for (const it of vault.items) {
      const g = it.game || "Other", t = times[it.id] ?? 0;
      gameCounts[g] = (gameCounts[g] || 0) + 1;
      totalCount++;
      if (t > 0) { gameTimes[g] = (gameTimes[g] || 0) + t; totalTime += t; }
    }
    for (const p of vault.presets) {
      const g = p.game || "Other", t = times[`preset:${p.id}`] ?? times[p.id] ?? 0;
      gameCounts[g] = (gameCounts[g] || 0) + 1;
      totalCount++;
      if (t > 0) { gameTimes[g] = (gameTimes[g] || 0) + t; totalTime += t; }
    }

    if (totalTime > 0) {
      return {
        modeLabel: "by active time",
        segments: Object.entries(gameTimes).sort((a, b) => b[1] - a[1]).map(([game, sec], i) => ({
          game, percent: Math.max(1, Math.round((sec / totalTime) * 100)), detail: formatDuration(sec), color: GAME_COLORS[game] || PALETTE[i % PALETTE.length],
        })),
      };
    }
    if (totalCount > 0) {
      return {
        modeLabel: "by library distribution",
        segments: Object.entries(gameCounts).sort((a, b) => b[1] - a[1]).map(([game, count], i) => ({
          game, percent: Math.max(1, Math.round((count / totalCount) * 100)), detail: `${count} ${count === 1 ? "overlay" : "overlays"}`, color: GAME_COLORS[game] || PALETTE[i % PALETTE.length],
        })),
      };
    }
    return { segments: [], modeLabel: "no activity" };
  }, [vault, usageStats]);

  return (
    <div className="page settings">
      <div className="settings-layout">
        <aside className="settings-sidebar">
          {SETTINGS_NAV.map((item) => (
            <button key={item.id} type="button" className={`settings-nav-btn ${activeTab === item.id ? "active" : ""}`} onClick={() => setActiveTab(item.id)}>
              <span className="settings-nav-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {NAV_ICONS[item.id]}
                </svg>
              </span>
              <span className="settings-nav-label">{item.label}</span>
            </button>
          ))}

          <div className="settings-sidebar-footer">
            <div className="settings-version-card">
              <div className="settings-version-top">
                <span className="settings-version-title mono">Iris v0.1.0</span>
                <span
                  className={`settings-update-dot ${updateStatus.status === "available" ? "has-update" : updateStatus.status === "upToDate" ? "ok" : ""}`}
                  title={updateStatus.status === "available" ? "Update available!" : updateStatus.status === "upToDate" ? "Up to date" : "Standing by"}
                />
              </div>
              <a href="https://github.com/allnighter51/Iris" target="_blank" rel="noreferrer" className="settings-repo-link mono">
                github.com/allnighter51/Iris
              </a>
            </div>
          </div>
        </aside>

        <main className="settings-content">
          {activeTab === "display" && (
            <div className="settings-panel">
              <div className="settings-panel-head">
                <h3 className="settings-panel-title">Overlay Display &amp; Game Targeting</h3>
                <p className="settings-panel-desc">Configure whether the overlay stays always-on-top or automatically attaches to running game processes.</p>
              </div>

              <SettingsRow title="Target Mode" desc="Always-on-top desktop overlay, or auto-attach (show overlay only while target game is focused).">
                <div className="seg">
                  <button className={s.targetMode === "topmost" ? "active" : ""} onClick={() => save({ targetMode: "topmost" })}>Always on Top</button>
                  <button className={s.targetMode === "game" ? "active" : ""} onClick={() => save({ targetMode: "game" })}>Auto-Attach to Game</button>
                </div>
              </SettingsRow>

              {s.targetMode === "game" && (
                <SettingsRow title="Game Executable" desc="Overlay appears only while this process is running.">
                  <div className="exe">
                    <select
                      className="input"
                      value={GAME_EXES.some((g) => g.exe === s.targetExe) ? s.targetExe : ""}
                      onChange={(e) => { if (e.target.value) { setExe(e.target.value); save({ targetExe: e.target.value }); } }}
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
                </SettingsRow>
              )}

              <SettingsRow title="Hide from Capture (OBS / Stream Mode)" desc="ON: Only you see the overlay on your screen (WDA_EXCLUDEFROMCAPTURE). OFF: Overlay also appears in OBS Game and Display capture.">
                <Toggle checked={s.hideFromCapture} onChange={(v) => save({ hideFromCapture: v })} />
              </SettingsRow>
              <SettingsRow title="Automatic Game Detection" desc="Detects foreground game processes (Overwatch, Valorant, Marvel Rivals) and auto-switches to matching loadouts.">
                <Toggle checked={s.autoGameSwitch ?? true} onChange={(v) => save({ autoGameSwitch: v })} />
              </SettingsRow>
              <SettingsRow title="Auto-Hide when Tabbed Out" desc="Conceals overlay when tabbed into Discord, Chrome, or Desktop; reappears instantly when you focus back on the game.">
                <Toggle checked={s.autoHideUnfocused ?? false} onChange={(v) => save({ autoHideUnfocused: v })} />
              </SettingsRow>
              <SettingsRow title="Focused Foreground Process" desc="Live hardware readout of the currently focused Windows application.">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono small" style={{ color: "var(--cyan)" }}>{currentForegroundExe || "desktop / idle"}</span>
                  <span className={`tag mono ${isGameActive ? "ok" : ""}`}>{isGameActive ? "● GAME DETECTED" : "○ BACKGROUND"}</span>
                </div>
              </SettingsRow>
            </div>
          )}

          {activeTab === "profiles" && (
            <div className="settings-panel">
              <div className="settings-panel-head">
                <h3 className="settings-panel-title">Game-to-HUD Profile Assignments</h3>
                <p className="settings-panel-desc">Automatically load a specific Vault Overlay or Layering Loadout when a supported game is launched.</p>
              </div>

              {vault ? (
                <div className="profile-list-container">
                  {KNOWN_GAMES.map((g) => {
                    const profiles = s.gameProfiles ?? {};
                    const currentVal = profiles[g.name] || "";
                    const isCustom = !!currentVal;
                    return (
                      <div key={g.name} className="profile-row">
                        <div className="profile-row-left">
                          <span className="profile-game-accent" style={{ backgroundColor: g.color }} />
                          <div className="profile-game-info">
                            <div className="profile-game-title-row">
                              <span className="profile-game-name">{g.label}</span>
                              {isCustom && <span className="profile-custom-pill">Custom</span>}
                            </div>
                            <span className="profile-game-exe mono" title={g.exes.join(", ")}>{g.exes[0]}</span>
                          </div>
                        </div>

                        <div className="profile-row-right">
                          <select
                            className={`input profile-select ${isCustom ? "custom-selected" : "auto-selected"}`}
                            value={currentVal}
                            onChange={(e) => {
                              const next = { ...profiles };
                              if (e.target.value) next[g.name] = e.target.value;
                              else delete next[g.name];
                              save({ gameProfiles: next });
                            }}
                          >
                            <option value="">Automatic (First Favorite / Matching HUD)</option>
                            {vault.presets.some((p) => p.game === g.name || !p.game) && (
                              <optgroup label="Layer Presets">
                                {vault.presets.map((p) => <option key={`preset:${p.id}`} value={`preset:${p.id}`}>★ Loadout: {p.name}</option>)}
                              </optgroup>
                            )}
                            <optgroup label="Vault Overlays">
                              {vault.items.filter((it) => it.game === g.name || it.game === "Other").map((it) => (
                                <option key={`item:${it.id}`} value={`item:${it.id}`}>{it.favorite ? "★ " : ""}{it.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted small" style={{ padding: 16 }}>Loading Vault profiles...</div>
              )}
            </div>
          )}

          {activeTab === "keybinds" && (
            <>
              <div className="settings-panel">
                <div className="settings-panel-head">
                  <h3 className="settings-panel-title">Global Hotkeys</h3>
                  <p className="settings-panel-desc">System-wide shortcuts active across Windows while in-game, streaming, or on desktop.</p>
                </div>
                {[
                  { k: "hotkeyToggle" as const, t: "Toggle Overlay Visibility", d: "Show or hide the active overlay on screen." },
                  { k: "hotkeyNext" as const, t: "Next Overlay", d: "Cycles overlays in the current Vault folder filter." },
                  { k: "hotkeyPrev" as const, t: "Previous Overlay", d: "Cycles backward through overlays in the current filter." },
                ].map((hk) => (
                  <SettingsRow key={hk.k} title={hk.t} desc={hk.d}>
                    <HotkeyInput value={s[hk.k]} onChange={(v) => save({ [hk.k]: v })} />
                  </SettingsRow>
                ))}
              </div>

              <div className="settings-panel">
                <div className="settings-panel-head">
                  <h3 className="settings-panel-title">Layer Role Hotkeys</h3>
                  <p className="settings-panel-desc">Toggle individual modular HUD parts in the composite stack (e.g. Map Overlay on Ctrl+Alt+M).</p>
                </div>
                {ROLES.map((r) => (
                  <SettingsRow key={r.id} title={r.label} desc={`Toggles all ${r.badge} layers.`}>
                    <HotkeyInput
                      value={s.layerHotkeys?.[r.id] ?? ""}
                      onChange={(v) => {
                        const next = { ...(s.layerHotkeys ?? {}) };
                        if (v) next[r.id] = v;
                        else delete next[r.id];
                        save({ layerHotkeys: next });
                      }}
                    />
                  </SettingsRow>
                ))}
              </div>
            </>
          )}

          {activeTab === "telemetry" && (
            <div className="settings-panel telemetry-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 className="settings-panel-title" style={{ margin: 0 }}>Iris Usage &amp; Activity</h3>
                  <p className="settings-panel-desc" style={{ marginTop: 2 }}>Live overlay and session telemetry tracking your Iris usage across games and presets.</p>
                </div>
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

              <div className="telemetry-bento-grid">
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
                      <img src={assetUrl(favOverlay.item.thumb ? vault.thumbsDir : vault.assetsDir, favOverlay.item.thumb ?? favOverlay.item.file)} alt={favOverlay.item.name} className="telemetry-hero-img" />
                      <div className="telemetry-equip-overlay">
                        <button type="button" className="btn small primary telemetry-equip-btn" onClick={() => onEquipItem?.(favOverlay.item!)}>⚡ Equip Now</button>
                      </div>
                    </div>
                  ) : favOverlay.preset && vault ? (
                    <div className="telemetry-hero-thumb">
                      <div className="telemetry-hero-glow" />
                      <div style={{ width: "85%", height: "85%", position: "relative", zIndex: 1 }}>
                        <StackThumb layers={favOverlay.preset.layers} vault={vault} refW={favOverlay.preset.refW} refH={favOverlay.preset.refH} />
                      </div>
                      <div className="telemetry-equip-overlay">
                        <button type="button" className="btn small primary telemetry-equip-btn" onClick={() => onEquipPreset?.(favOverlay.preset!)}>⚡ Equip Now</button>
                      </div>
                    </div>
                  ) : (
                    <div className="telemetry-hero-thumb empty">
                      <div className="muted small" style={{ textAlign: "center", padding: 16 }}>No overlays in Vault</div>
                    </div>
                  )}

                  <div className="telemetry-hero-details">
                    <div className="telemetry-hero-name-row">
                      <div className="telemetry-hero-name" title={favOverlay.name}>{favOverlay.name}</div>
                      {favOverlay.isRecentFallback || favOverlay.timeSeconds === 0 ? (
                        <span className="telemetry-badge recent">Recently Added</span>
                      ) : (
                        <span className="telemetry-badge active-time">⏱ {favOverlay.timeFormatted}</span>
                      )}
                    </div>
                    <div className="telemetry-hero-meta">
                      {favOverlay.sub && <span className={`tag mono ${gameClass(favOverlay.sub)}`}>{favOverlay.sub}</span>}
                      {favOverlay.tag && <span className="tag mono">{ELEMENT_TAGS.find((t) => t.id === favOverlay.tag)?.label || favOverlay.tag}</span>}
                    </div>
                  </div>
                </div>

                <div className="telemetry-right-col">
                  <div className="telemetry-stat-strip">
                    <div className="bento-cell telemetry-stat-cell">
                      <div className="bento-label">VAULT LIBRARY</div>
                      <div className="bento-value">{effectiveUploads}</div>
                      <div className="bento-sub">{vaultItemCount} {vaultItemCount === 1 ? "overlay" : "overlays"}{estimatedSizeMB !== "0" ? ` · ~${estimatedSizeMB} MB` : ""}</div>
                    </div>
                    <div className="bento-cell telemetry-stat-cell">
                      <div className="bento-label">OVERLAYS SWAPPED</div>
                      <div className="bento-value">{usageStats?.totalSwaps ?? 0}</div>
                      <div className="bento-sub">Switches &amp; cyclers</div>
                    </div>
                    <div className="bento-cell telemetry-stat-cell">
                      <div className="bento-label">ACTIVE HUD TIME</div>
                      <div className="bento-value">{formatDuration(usageStats?.totalAppTimeSeconds ?? 0)}</div>
                      <div className="bento-sub">Lifetime Iris usage</div>
                    </div>
                  </div>

                  <div className="bento-cell telemetry-breakdown-card">
                    <div className="telemetry-breakdown-head">
                      <span className="bento-label">GAME ACTIVITY BREAKDOWN</span>
                      <span className="mono muted small">{gameBreakdown.modeLabel}</span>
                    </div>

                    <div className="telemetry-progress-track">
                      {gameBreakdown.segments.map((seg) => (
                        <div key={seg.game} className="telemetry-segment" style={{ width: `${seg.percent}%`, backgroundColor: seg.color }} title={`${seg.game}: ${seg.percent}% (${seg.detail})`} />
                      ))}
                      {gameBreakdown.segments.length === 0 && <div className="telemetry-segment-empty" style={{ width: "100%" }} />}
                    </div>

                    <div className="telemetry-legend">
                      {gameBreakdown.segments.map((seg) => (
                        <div key={seg.game} className="telemetry-legend-item">
                          <span className="telemetry-dot" style={{ backgroundColor: seg.color }} />
                          <span className="telemetry-legend-name">{seg.game}</span>
                          <span className="telemetry-legend-pct mono">{seg.percent}%</span>
                        </div>
                      ))}
                      {gameBreakdown.segments.length === 0 && <span className="muted small">No game activity recorded yet</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <>
              <div className="settings-panel">
                <div className="settings-panel-head">
                  <h3 className="settings-panel-title">System &amp; Storage</h3>
                  <p className="settings-panel-desc">Configure boot behavior, background minimization, GPU compositing, and asset paths.</p>
                </div>

                <SettingsRow title="Start minimized to tray on Windows boot" desc="Registers Iris in HKCU\...\Run with --minimized.">
                  <Toggle checked={s.startWithWindows} onChange={(v) => save({ startWithWindows: v })} />
                </SettingsRow>
                <SettingsRow title="Close button minimizes to tray" desc="Keeps the overlay and hotkeys alive. Use the tray icon to quit.">
                  <Toggle checked={s.closeToTray} onChange={(v) => save({ closeToTray: v })} />
                </SettingsRow>
                <SettingsRow title="Hardware Acceleration" desc="GPU-composited rendering. Requires application restart.">
                  <Toggle checked={s.hardwareAcceleration} onChange={(v) => { setNeedsRestart(true); save({ hardwareAcceleration: v }); }} />
                </SettingsRow>
                <SettingsRow title="Low-Resource Mode" desc="Disables color filters on the overlay and slows background process polling.">
                  <Toggle checked={s.lowResource} onChange={(v) => save({ lowResource: v })} />
                </SettingsRow>
                {needsRestart && <div className="note mono" style={{ margin: "10px 0" }}>&#x21BB; Restart Iris to apply the hardware acceleration change.</div>}
                <SettingsRow title="Local Vault Directory" desc="PNG assets, thumbnails, vault_manifest.json and settings.json on your computer.">
                  <button className="btn outline" onClick={() => api.openVaultDir()}>Open Vault Directory</button>
                </SettingsRow>
              </div>

              <div className="settings-panel">
                <div className="settings-panel-head">
                  <h3 className="settings-panel-title">Updates &amp; Release Maintenance</h3>
                  <p className="settings-panel-desc">Official release channel, auto-updater telemetry, and GitHub release binaries.</p>
                </div>

                <SettingsRow title="App Version &amp; Repository" desc="Iris Desktop Overlay utility releases are distributed via GitHub Releases.">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono bold" style={{ color: "var(--cyan)" }}>Iris v0.1.0</span>
                    <a href="https://github.com/allnighter51/Iris" target="_blank" rel="noreferrer" className="tag mono" style={{ textDecoration: "none", cursor: "pointer" }}>
                      github.com/allnighter51/Iris
                    </a>
                  </div>
                </SettingsRow>

                <SettingsRow title="Check for updates on app startup" desc="Silently checks GitHub Releases in the background. Does not interrupt or steal focus while playing or streaming.">
                  <Toggle checked={s.checkUpdatesOnStartup ?? true} onChange={(v) => save({ checkUpdatesOnStartup: v })} />
                </SettingsRow>

                <SettingsRow title="Update Status" desc="Current status of the official Tauri auto-updater.">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {updateStatus.status === "idle" && <span className="tag mono">○ STANDBY</span>}
                    {updateStatus.status === "checking" && <span className="tag mono" style={{ color: "var(--cyan)" }}>⟳ CHECKING GITHUB RELEASES...</span>}
                    {updateStatus.status === "upToDate" && <span className="tag mono ok">● UP TO DATE (v{updateStatus.currentVersion})</span>}
                    {updateStatus.status === "available" && <span className="tag mono" style={{ color: "var(--cyan)", borderColor: "var(--cyan)" }}>★ UPDATE AVAILABLE: v{updateStatus.version}</span>}
                    {updateStatus.status === "downloading" && (
                      <span className="tag mono" style={{ color: "var(--purple)", borderColor: "var(--purple)" }}>
                        ↓ DOWNLOADING {updateStatus.progress.toFixed(0)}%
                        {updateStatus.total ? ` (${(updateStatus.downloaded / (1024 * 1024)).toFixed(1)} / ${(updateStatus.total / (1024 * 1024)).toFixed(1)} MB)` : ""}
                      </span>
                    )}
                    {updateStatus.status === "downloaded" && <span className="tag mono ok" style={{ borderColor: "var(--emerald)" }}>✓ UPDATE READY TO INSTALL (v{updateStatus.version})</span>}
                    {updateStatus.status === "error" && (
                      <span className="tag mono" style={{ color: "#f87171", borderColor: "#f87171" }} title={updateStatus.message}>
                        ⚠ {updateStatus.message.length > 50 ? `${updateStatus.message.slice(0, 50)}...` : updateStatus.message}
                      </span>
                    )}
                  </div>
                </SettingsRow>

                {updateStatus.status === "available" && updateStatus.body && (
                  <div style={{ margin: "12px 0", padding: "12px", background: "rgba(10, 11, 18, 0.8)", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <div className="mono small bold" style={{ color: "var(--cyan)", marginBottom: 4 }}>Release Notes (v{updateStatus.version})</div>
                    <div className="small muted" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>{updateStatus.body}</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn outline" disabled={updateStatus.status === "checking" || updateStatus.status === "downloading"} onClick={onCheckUpdate}>
                    {updateStatus.status === "checking" ? "Checking..." : "Check for Updates"}
                  </button>
                  {updateStatus.status === "available" && <button className="btn primary" onClick={onDownloadUpdate}>Download in Background</button>}
                  {updateStatus.status === "downloaded" && <button className="btn primary" onClick={onRestartUpdate}>Restart &amp; Update Now</button>}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
