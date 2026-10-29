import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, assetUrl } from "../api";
import { ELEMENT_TAGS, KNOWN_GAMES, ROLES, type CompositePreset, type FseStatus, type MonitorInfo, type OverlayStatus, type Settings, type UpdateStatus, type VaultData, type VaultItem } from "../types";
import { computeFavoriteOverlay, formatDuration, type UsageStats } from "../usage";
import { gameClass } from "../util";
import { StackThumb } from "./SceneView";
import { Toggle } from "./ui";
import { GAMES_DATABASE, GAME_GENRES, type GameGenre } from "../games";

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

function SettingsRow({ title, desc, children, stacked }: { title: string; desc?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={`settings-row ${stacked ? "stacked" : ""}`}>
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
  appVersion?: string;
  onCheckUpdate?: () => void;
  onDownloadUpdate?: () => void;
  onRestartUpdate?: () => void;
  monitors?: MonitorInfo[];
  currentMonitor?: number;
  onSelectMonitor?: (idx: number) => void;
  fseStatus?: FseStatus;
  onDismissFse?: () => void;
  status?: OverlayStatus;
  targetSubTab?: SettingsTab;
  onClearTargetSubTab?: () => void;
}

export function SettingsView({
  settings: s, save, currentForegroundExe, vault, usageStats, activeOverlayItemId,
  isTelemetryPaused, onToggleTelemetry, onResetTelemetry, onEquipItem, onEquipPreset,
  updateStatus = { status: "idle" }, appVersion, onCheckUpdate, onDownloadUpdate, onRestartUpdate,
  monitors = [], currentMonitor = 0, onSelectMonitor, fseStatus, onDismissFse, status,
  targetSubTab, onClearTargetSubTab,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("display");
  const updateCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (targetSubTab) {
      setActiveTab(targetSubTab);
      onClearTargetSubTab?.();
      if (targetSubTab === "system") {
        setTimeout(() => {
          updateCardRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 60);
      }
    }
  }, [targetSubTab, onClearTargetSubTab]);

  const [needsRestart, setNeedsRestart] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastExternalExe, setLastExternalExe] = useState<string | null>(() => {
    try {
      return localStorage.getItem("iris_last_external_exe") || null;
    } catch {
      return null;
    }
  });
  const [customExeInput, setCustomExeInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<GameGenre>("All");
  const [runningProcesses, setRunningProcesses] = useState<string[]>([]);
  const [isScanningProcesses, setIsScanningProcesses] = useState(false);

  const refreshRunningProcesses = useCallback(async () => {
    setIsScanningProcesses(true);
    try {
      const list = await api.listRunningProcesses();
      setRunningProcesses(list);
    } catch (err) {
      console.error("Failed to list running processes:", err);
    } finally {
      setIsScanningProcesses(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "display") {
      refreshRunningProcesses();
    }
  }, [activeTab, refreshRunningProcesses]);

  useEffect(() => {
    if (currentForegroundExe) {
      const lower = currentForegroundExe.toLowerCase().trim();
      if (lower && lower !== "iris.exe" && lower !== "iris" && !lower.includes("iris.exe")) {
        setLastExternalExe(currentForegroundExe);
        try {
          localStorage.setItem("iris_last_external_exe", currentForegroundExe);
        } catch { /* ignore */ }
      }
    }
  }, [currentForegroundExe]);

  const customTargets = s.customTargetExes ?? [];

  const addCustomTarget = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = customTargets.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      save({ customTargetExes: [...customTargets, trimmed] });
    }
    setCustomExeInput("");
  };

  const removeCustomTarget = (name: string) => {
    save({ customTargetExes: customTargets.filter((t) => t.toLowerCase() !== name.toLowerCase()) });
  };

  const isSmartDetect = s.targetMode === "smart_detect" || s.targetMode === "game";
  const smartDetectAll = s.smartDetectAll ?? true;
  const enabledGameIds = useMemo(() => new Set(s.enabledGameIds ?? []), [s.enabledGameIds]);

  const isGameEnabled = (gameId: string) => smartDetectAll || enabledGameIds.has(gameId);

  const toggleGame = (gameId: string) => {
    if (smartDetectAll) {
      const next = GAMES_DATABASE.map((g) => g.id).filter((id) => id !== gameId);
      save({ smartDetectAll: false, enabledGameIds: next });
    } else {
      const next = new Set(enabledGameIds);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      const nextArr = Array.from(next);
      if (nextArr.length === GAMES_DATABASE.length) {
        save({ smartDetectAll: true, enabledGameIds: [] });
      } else {
        save({ smartDetectAll: false, enabledGameIds: nextArr });
      }
    }
  };

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GAMES_DATABASE.filter((g) => {
      const matchesGenre = selectedGenre === "All" || g.genre === selectedGenre;
      if (!matchesGenre) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.exes.some((e) => e.toLowerCase().includes(q)) ||
        g.genre.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedGenre]);

  const enabledCount = smartDetectAll ? GAMES_DATABASE.length : (s.enabledGameIds?.length ?? 0);

  const availableRunningProcs = useMemo(() => {
    const catalogExes = new Set(GAMES_DATABASE.flatMap((g) => g.exes.map((e) => e.toLowerCase())));
    const customSet = new Set(customTargets.map((c) => c.toLowerCase()));
    const ignoreSet = new Set([
      "iris.exe", "iris", "explorer.exe", "taskhostw.exe", "svchost.exe",
      "searchapp.exe", "startmenuexperiencehost.exe", "textinputhost.exe",
      "shellexperiencehost.exe", "applicationframehost.exe", "systemsettings.exe",
      "lockapp.exe", "ctfmon.exe", "dwm.exe", "runtimebroker.exe", "conhost.exe",
      "cmd.exe", "powershell.exe", "pwsh.exe", "openconsole.exe",
    ]);

    return runningProcesses.filter((proc) => {
      const lower = proc.toLowerCase().trim();
      if (!lower || ignoreSet.has(lower)) return false;
      if (catalogExes.has(lower)) return false;
      if (customSet.has(lower)) return false;
      return true;
    });
  }, [runningProcesses, customTargets]);

  useEffect(() => {
    if (activeTab === "system" && updateStatus.status === "idle" && onCheckUpdate) {
      onCheckUpdate();
    }
  }, [activeTab, updateStatus.status, onCheckUpdate]);

  const hasUpdate = updateStatus.status === "available" || updateStatus.status === "downloaded" || updateStatus.status === "downloading";
  const displayVersion = appVersion
    || (updateStatus.status === "upToDate" || updateStatus.status === "available"
      ? updateStatus.currentVersion
      : updateStatus.status === "downloaded"
      ? updateStatus.version
      : "")
    || "";

  const isBuiltinGame = !!currentForegroundExe && GAMES_DATABASE.some((g) => g.exes.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase()));
  const isCustomGame = !!currentForegroundExe && customTargets.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase());
  const isGameActive = isBuiltinGame || isCustomGame;
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
              {item.id === "display" && fseStatus?.isFse && (
                <span className="settings-nav-badge-warn" title="Fullscreen Exclusive active">!</span>
              )}
              {item.id === "system" && hasUpdate && (
                <span className="settings-nav-badge-new" title="Update Available">NEW</span>
              )}
            </button>
          ))}

          <div className="settings-sidebar-footer">
            <div className="settings-version-card">
              <div className="settings-version-top">
                <span className="settings-version-title mono">{displayVersion ? `Iris v${displayVersion}` : "Iris"}</span>
                {updateStatus.status === "available" && (
                  <button
                    type="button"
                    className="settings-version-update-pill"
                    onClick={() => {
                      setActiveTab("system");
                      setTimeout(() => {
                        updateCardRef.current?.scrollIntoView({ behavior: "smooth" });
                      }, 50);
                    }}
                    title={`Update available: v${updateStatus.version}. Click to review & install.`}
                  >
                    → v{updateStatus.version}
                  </button>
                )}
                {updateStatus.status === "downloading" && (
                  <span className="settings-version-update-pill downloading" title={`Downloading: ${updateStatus.progress.toFixed(0)}%`}>
                    ↓ {updateStatus.progress.toFixed(0)}%
                  </span>
                )}
                {updateStatus.status === "downloaded" && (
                  <button
                    type="button"
                    className="settings-version-update-pill ready"
                    onClick={onRestartUpdate}
                    title={`v${updateStatus.version} is ready! Click to restart & apply`}
                  >
                    ⚡ v{updateStatus.version}
                  </button>
                )}
                <span
                  className={`settings-update-dot ${hasUpdate ? "has-update" : updateStatus.status === "upToDate" ? "ok" : ""}`}
                  title={
                    updateStatus.status === "available"
                      ? `Update available: v${updateStatus.version}`
                      : updateStatus.status === "downloaded"
                      ? `Update ready to install: v${updateStatus.version}`
                      : updateStatus.status === "upToDate"
                      ? `Up to date (v${updateStatus.currentVersion})`
                      : updateStatus.status === "checking"
                      ? "Checking GitHub releases..."
                      : "Standing by"
                  }
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
              {fseStatus?.isFse && (
                <div className="fse-warning-banner">
                  <div className="fse-banner-icon">⚠️</div>
                  <div className="fse-banner-body">
                    <div className="fse-banner-header">
                      <div className="fse-banner-title">
                        Exclusive Fullscreen Detected — Desktop Overlay Blocked
                      </div>
                      {onDismissFse && (
                        <button type="button" className="fse-banner-close" onClick={onDismissFse} title="Dismiss notification">
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="fse-banner-desc">
                      <strong>{fseStatus.gameExe || "Your game"}</strong> is currently running in <em>Hardware Fullscreen Exclusive (FSE)</em> mode with Windows Fullscreen Optimizations disabled. In this mode, DirectX claims exclusive control of the display output and bypasses the Windows Desktop Window Manager (DWM), preventing any external desktop overlay from drawing over the game.
                    </div>
                    <div className="fse-banner-steps">
                      <div className="fse-step-title">How to restore overlay visibility (Choose one):</div>
                      <div className="fse-step-item">
                        <span className="fse-step-badge">1 (Recommended)</span>
                        <span>
                          Open <strong>{fseStatus.gameExe ? fseStatus.gameExe.replace(/\.exe$/i, "") : "in-game"}</strong> Video Settings and switch <strong>Display Mode</strong> from <em>Fullscreen</em> to <strong>Windowed Fullscreen</strong> (Borderless). On Windows 10/11 with DirectX 11 flip model, this provides identical latency while enabling overlay compositing.
                        </span>
                      </div>
                      <div className="fse-step-item">
                        <span className="fse-step-badge">2 (Alternative)</span>
                        <span>
                          Right-click <code>{fseStatus.gameExe || "VALORANT-Win64-Shipping.exe"}</code> &gt; <strong>Properties</strong> &gt; <strong>Compatibility</strong> &gt; uncheck <strong>"Disable fullscreen optimizations"</strong>, then apply and restart the game.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="settings-panel-head">
                <h3 className="settings-panel-title">Overlay Display &amp; Game Targeting</h3>
                <p className="settings-panel-desc">Configure whether the overlay stays always-on-top or automatically attaches to running game processes.</p>
              </div>

              <SettingsRow
                stacked
                title="Display Target Mode"
                desc="Choose whether Iris stays permanently projected over all games and desktop, or dynamically detects running games."
              >
                <div className="target-mode-buttons">
                  <button
                    type="button"
                    className={`target-mode-btn ${!isSmartDetect ? "active" : ""}`}
                    onClick={() => save({ targetMode: "force_on_screen" })}
                  >
                    <div className="tmb-title">Force on Screen</div>
                    <div className="tmb-desc">Overlay always stays visible over desktop and any game</div>
                    <span className={`tmb-badge ${!isSmartDetect ? "active" : ""}`}>ALWAYS VISIBLE</span>
                  </button>
                  <button
                    type="button"
                    className={`target-mode-btn ${isSmartDetect ? "active" : ""}`}
                    onClick={() => save({ targetMode: "smart_detect" })}
                  >
                    <div className="tmb-title">Smart Game Detect</div>
                    <div className="tmb-desc">Auto-shows when games are active; auto-hides when closed</div>
                    <span className={`tmb-badge ${isSmartDetect ? "active" : ""}`}>AUTO-DETECT</span>
                  </button>
                </div>
              </SettingsRow>

              <div className="target-games-dropdown">
                {!isSmartDetect && (
                  <div className="target-mode-banner mono small">
                    <span style={{ color: "var(--cyan)" }}>ℹ Mode Notice:</span> <strong>Force on Screen</strong> is currently active (always visible). Game selection below will govern visibility when <strong>Smart Game Detect</strong> is enabled.
                  </div>
                )}

                <div className="tgd-header">
                  <div className="tgd-header-left">
                    <div className="tgd-title">
                      <span>🎮 Target Games Catalog</span>
                      <span className="tgd-count-badge mono">{enabledCount} / {GAMES_DATABASE.length} Active</span>
                    </div>
                    <div className="tgd-status-pill">
                      {status?.activeGame ? (
                        <span className="mono mini ok">● OVERLAY ACTIVE ({status.activeGame.toUpperCase()})</span>
                      ) : status?.gameRunning ? (
                        <span className="mono mini ok">● GAME DETECTED ({status.activeExe || "RUNNING"})</span>
                      ) : (
                        <span className="mono mini muted">○ WAITING FOR GAME...</span>
                      )}
                    </div>
                  </div>
                  <div className="tgd-header-right">
                    <div className="tgd-master-toggle">
                      <span className="mono mini muted">All Supported (124)</span>
                      <Toggle
                        checked={smartDetectAll}
                        onChange={(v) => {
                          if (v) {
                            save({ smartDetectAll: true, enabledGameIds: [] });
                          } else {
                            save({ smartDetectAll: false, enabledGameIds: GAMES_DATABASE.map((g) => g.id) });
                          }
                        }}
                      />
                    </div>
                    <div className="tgd-action-btns">
                      <button
                        type="button"
                        className="btn outline small mini-btn"
                        onClick={() => save({ smartDetectAll: true, enabledGameIds: [] })}
                        title="Enable all 124 popular gaming titles"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn outline small mini-btn"
                        onClick={() => save({ smartDetectAll: false, enabledGameIds: [] })}
                        title="Deselect all games (only custom exes will be tracked)"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                </div>

                <div className="tgd-toolbar">
                  <div className="tgd-search-box">
                    <span className="tgd-search-icon">🔍</span>
                    <input
                      type="text"
                      className="input mono small tgd-search-input"
                      placeholder="Search title or .exe (e.g. Valorant, cs2.exe)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button type="button" className="tgd-search-clear" onClick={() => setSearchQuery("")}>
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="tgd-genre-chips">
                    {GAME_GENRES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`tgd-genre-chip ${selectedGenre === g ? "active" : ""}`}
                        onClick={() => setSelectedGenre(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tgd-games-list">
                  {filteredGames.length === 0 ? (
                    <div className="tgd-empty mono small muted">
                      No games match "{searchQuery}" in {selectedGenre}. You can add it below as a custom executable!
                    </div>
                  ) : (
                    filteredGames.map((game) => {
                      const enabled = isGameEnabled(game.id);
                      const isRunning =
                        (status?.activeExe && game.exes.some((e) => e.toLowerCase() === status.activeExe?.toLowerCase())) ||
                        (currentForegroundExe && game.exes.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase())) ||
                        runningProcesses.some((p) => game.exes.some((e) => e.toLowerCase() === p.toLowerCase()));

                      return (
                        <div
                          key={game.id}
                          className={`tgd-game-item ${enabled ? "enabled" : "disabled"} ${isRunning ? "running" : ""}`}
                          onClick={() => toggleGame(game.id)}
                        >
                          <div className="tgd-game-left">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Toggle
                                checked={enabled}
                                onChange={() => toggleGame(game.id)}
                              />
                            </div>
                            <span className="tgd-game-dot" style={{ backgroundColor: game.color }} />
                            <div className="tgd-game-meta">
                              <div className="tgd-game-name-row">
                                <span className="tgd-game-name">{game.name}</span>
                                {isRunning && (
                                  <span className="tgd-running-badge mono">● RUNNING NOW</span>
                                )}
                              </div>
                              <div className="tgd-game-sub mono">
                                <span className="tgd-genre-tag">{game.genre}</span>
                                <span className="tgd-exe-tag">{game.exes[0]}</span>
                                {game.exes.length > 1 && (
                                  <span className="tgd-exe-extra">+{game.exes.length - 1} more</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="tgd-game-right">
                            <span className={`tgd-switch-label mono ${enabled ? "ok" : "muted"}`}>
                              {enabled ? "ACTIVE" : "OFF"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="tgd-custom-section">
                  <div className="tgd-custom-title-row">
                    <span className="tgd-custom-title mono bold">Custom Game Executables &amp; Process Quick-Picker</span>
                    <button
                      type="button"
                      className="btn outline small mini-btn"
                      onClick={refreshRunningProcesses}
                      disabled={isScanningProcesses}
                      title="Refresh running Windows processes list"
                    >
                      {isScanningProcesses ? "Scanning..." : "🔄 Refresh Processes"}
                    </button>
                  </div>

                  <div className="tgd-add-row">
                    <input
                      type="text"
                      className="input mono small"
                      placeholder="Add custom game executable (e.g. MyGame-Win64-Shipping.exe)..."
                      value={customExeInput}
                      onChange={(e) => setCustomExeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomTarget(customExeInput);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={!customExeInput.trim()}
                      onClick={() => addCustomTarget(customExeInput)}
                    >
                      + Add Target
                    </button>
                  </div>

                  {availableRunningProcs.length > 0 && (
                    <div className="tgd-proc-picker">
                      <span className="mono mini muted">Running on PC (Click to track):</span>
                      <div className="tgd-proc-chips">
                        {availableRunningProcs.slice(0, 14).map((proc) => (
                          <button
                            key={proc}
                            type="button"
                            className="tgd-proc-chip mono"
                            onClick={() => addCustomTarget(proc)}
                            title={`Add ${proc} to custom targets`}
                          >
                            + {proc}
                          </button>
                        ))}
                        {availableRunningProcs.length > 14 && (
                          <span className="mono mini muted" style={{ alignSelf: "center" }}>
                            +{availableRunningProcs.length - 14} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {customTargets.length > 0 && (
                    <div className="tgd-custom-chips">
                      <span className="mono mini" style={{ color: "var(--cyan)" }}>Tracked Custom Games ({customTargets.length}):</span>
                      <div className="custom-chips-wrap">
                        {customTargets.map((target) => (
                          <span key={target} className="custom-exe-chip mono">
                            <span className="chip-text">{target}</span>
                            <button
                              type="button"
                              className="chip-del-btn"
                              title={`Remove ${target}`}
                              onClick={() => removeCustomTarget(target)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <SettingsRow
                title="Target Display & Monitor Routing"
                desc="Choose which physical display renders the overlay, or automatically follow the active game window."
              >
                <div className="monitor-routing-ctrl">
                  <select
                    className="input"
                    value={s.targetMonitorMode === "follow-game" ? "follow-game" : String(currentMonitor)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "follow-game") {
                        save({ targetMonitorMode: "follow-game" });
                      } else {
                        const idx = parseInt(val, 10);
                        save({ targetMonitorMode: "manual" });
                        onSelectMonitor?.(idx);
                      }
                    }}
                  >
                    <option value="follow-game">⚡ Follow Game Monitor (Auto-route)</option>
                    {monitors.length > 0 ? (
                      monitors.map((m) => (
                        <option key={m.index} value={String(m.index)}>
                          {m.name || `Display ${m.index + 1}`}: {m.width}x{m.height}{m.refreshHz ? ` @ ${m.refreshHz}Hz` : ""}{m.index === 0 ? " (Primary)" : ""}
                        </option>
                      ))
                    ) : (
                      <option value="0">Display 1 (Primary)</option>
                    )}
                  </select>
                </div>
              </SettingsRow>

              <SettingsRow
                title="Aspect Ratio & Ultrawide Alignment"
                desc="Controls how 16:9 HUD overlays align on 21:9 ultrawide or mismatched monitor resolutions."
              >
                <div className="seg">
                  <button
                    type="button"
                    className={(s.aspectScalingMode ?? "contain-16-9") === "contain-16-9" ? "active" : ""}
                    onClick={() => save({ aspectScalingMode: "contain-16-9" })}
                  >
                    Center 16:9 Safe-Zone
                  </button>
                  <button
                    type="button"
                    className={s.aspectScalingMode === "fill-screen" ? "active" : ""}
                    onClick={() => save({ aspectScalingMode: "fill-screen" })}
                  >
                    Stretch to Screen
                  </button>
                  <button
                    type="button"
                    className={s.aspectScalingMode === "native-1-1" ? "active" : ""}
                    onClick={() => save({ aspectScalingMode: "native-1-1" })}
                  >
                    1:1 Pixel Native
                  </button>
                </div>
              </SettingsRow>

              <SettingsRow title="Hide from Capture (OBS / Stream Mode)" desc="ON: Only you see the overlay on your screen (WDA_EXCLUDEFROMCAPTURE). OFF: Overlay also appears in OBS Game and Display capture.">
                <Toggle checked={s.hideFromCapture} onChange={(v) => save({ hideFromCapture: v })} />
              </SettingsRow>
              <SettingsRow title="Automatic Game Detection" desc="Detects foreground game processes (Overwatch, Valorant, Marvel Rivals) and auto-switches to matching loadouts.">
                <Toggle checked={s.autoGameSwitch ?? true} onChange={(v) => save({ autoGameSwitch: v })} />
              </SettingsRow>
              <SettingsRow title="Auto-Hide when Tabbed Out" desc="Conceals overlay when tabbed into Discord, Chrome, or Desktop; reappears instantly when you focus back on the game.">
                <Toggle checked={s.autoHideUnfocused ?? false} onChange={(v) => save({ autoHideUnfocused: v })} />
              </SettingsRow>

              <SettingsRow
                title="Detection & Alt-Tab Response Speed"
                desc="Controls how frequently Iris checks foreground window focus for Auto-Attach and Auto-Hide."
              >
                <div className="seg">
                  <button
                    type="button"
                    className={(s.watcherPollMs ?? 500) === 250 ? "active" : ""}
                    onClick={() => save({ watcherPollMs: 250 })}
                  >
                    Instant (250ms)
                  </button>
                  <button
                    type="button"
                    className={(s.watcherPollMs ?? 500) === 500 ? "active" : ""}
                    onClick={() => save({ watcherPollMs: 500 })}
                  >
                    Balanced (500ms)
                  </button>
                  <button
                    type="button"
                    className={(s.watcherPollMs ?? 500) === 1500 ? "active" : ""}
                    onClick={() => save({ watcherPollMs: 1500 })}
                  >
                    Eco (1.5s)
                  </button>
                </div>
              </SettingsRow>

              <SettingsRow
                title="Focused Foreground Process"
                desc="Live hardware readout of the currently focused Windows application with 1-click custom target tracking."
              >
                <div className="target-inspector">
                  <div className="target-inspector-live">
                    <div className="target-inspector-left">
                      <span className="mono small live-exe-name">{currentForegroundExe || "desktop / idle"}</span>
                      <span className={`tag mono ${isGameActive ? "ok" : ""}`}>{isGameActive ? "● GAME DETECTED" : "○ BACKGROUND"}</span>
                    </div>

                    {lastExternalExe && (
                      <div className="last-external-pill-box">
                        <span className="last-external-label">Last External:</span>
                        <span className="last-external-val mono">{lastExternalExe}</span>
                        {!customTargets.some((x) => x.toLowerCase() === lastExternalExe.toLowerCase()) && (
                          <button
                            type="button"
                            className="btn outline small track-btn"
                            title={`Add ${lastExternalExe} to target game pool`}
                            onClick={() => addCustomTarget(lastExternalExe)}
                          >
                            + Track .exe
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="custom-target-input-row">
                    <input
                      type="text"
                      className="input mono small custom-exe-input"
                      placeholder="Add custom target (e.g. cs2.exe)..."
                      value={customExeInput}
                      onChange={(e) => setCustomExeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomTarget(customExeInput);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn outline small"
                      disabled={!customExeInput.trim()}
                      onClick={() => addCustomTarget(customExeInput)}
                    >
                      + Add Target
                    </button>
                  </div>

                  {customTargets.length > 0 && (
                    <div className="custom-chips-row">
                      <span className="custom-chips-heading">Tracked Custom Exes:</span>
                      <div className="custom-chips-wrap">
                        {customTargets.map((target) => (
                          <span key={target} className="custom-exe-chip mono">
                            <span className="chip-text">{target}</span>
                            <button
                              type="button"
                              className="chip-del-btn"
                              title={`Remove ${target}`}
                              onClick={() => removeCustomTarget(target)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SettingsRow>

              <div className="hardware-status-strip">
                <div className="hw-badge">
                  <span className="hw-dot active" />
                  <span className="hw-title">Click-Through Lock:</span>
                  <span className="hw-val active mono">ACTIVE (WS_EX_TRANSPARENT)</span>
                </div>

                <div className="hw-badge">
                  <span className={`hw-dot ${s.hideFromCapture ? "active" : "muted"}`} />
                  <span className="hw-title">Stream Capture Shield:</span>
                  <span className={`hw-val mono ${s.hideFromCapture ? "active" : "muted"}`}>
                    {s.hideFromCapture ? "ON (WDA_EXCLUDEFROMCAPTURE)" : "OFF (Visible)"}
                  </span>
                </div>

                <div className="hw-badge">
                  <span className="hw-dot info" />
                  <span className="hw-title">Active Target Pool:</span>
                  <span className="hw-val mono info">
                    {KNOWN_GAMES.reduce((acc, g) => acc + g.exes.length, 0) + customTargets.length} Exes
                  </span>
                </div>
              </div>
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

              <div style={{ marginTop: 16 }}>
                <SettingsRow
                  title="Anonymous Live Telemetry"
                  desc="Sends lightweight, anonymous 10-minute session heartbeats and game engagement to the live Aether Deck dashboard. Zero personal information, usernames, or file paths are ever collected."
                >
                  <Toggle
                    checked={s.telemetryEnabled ?? true}
                    onChange={(v) => save({ telemetryEnabled: v })}
                  />
                </SettingsRow>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <>
              {updateStatus.status === "available" && (
                <div className="settings-update-banner">
                  <div>
                    <div className="settings-update-banner-title">
                      <span style={{ color: "var(--emerald)" }}>★</span> Iris Update v{updateStatus.version} is Available
                    </div>
                    <div className="settings-update-banner-desc">
                      Download and install the latest release in a single click.
                    </div>
                  </div>
                  <button type="button" className="btn primary" onClick={onDownloadUpdate}>
                    Update Now (v{updateStatus.version})
                  </button>
                </div>
              )}

              {updateStatus.status === "downloading" && (
                <div className="settings-update-banner">
                  <div>
                    <div className="settings-update-banner-title">
                      <span style={{ color: "var(--cyan)" }}>↓</span> Downloading Iris v{updateStatus.version}...
                    </div>
                    <div className="settings-update-banner-desc">
                      {updateStatus.progress.toFixed(0)}%{updateStatus.total ? ` (${(updateStatus.downloaded / (1024 * 1024)).toFixed(1)} / ${(updateStatus.total / (1024 * 1024)).toFixed(1)} MB)` : ""}
                    </div>
                  </div>
                  <span className="tag mono" style={{ color: "var(--purple)", borderColor: "var(--purple)" }}>
                    DOWNLOADING {updateStatus.progress.toFixed(0)}%
                  </span>
                </div>
              )}

              {updateStatus.status === "downloaded" && (
                <div className="settings-update-banner ready">
                  <div>
                    <div className="settings-update-banner-title">
                      <span style={{ color: "var(--emerald)" }}>⚡</span> Iris v{updateStatus.version} Downloaded &amp; Ready
                    </div>
                    <div className="settings-update-banner-desc">
                      The update is staged. Restart Iris to apply changes immediately.
                    </div>
                  </div>
                  <button type="button" className="btn primary" onClick={onRestartUpdate}>
                    Restart &amp; Apply Now
                  </button>
                </div>
              )}

              {/* Updates & Release Maintenance Panel */}
              <div
                ref={updateCardRef}
                className="settings-panel"
                style={{ order: hasUpdate ? 1 : 2 }}
              >
                <div className="settings-panel-head">
                  <h3 className="settings-panel-title">Updates &amp; Release Maintenance</h3>
                  <p className="settings-panel-desc">Official release channel, auto-updater telemetry, and GitHub release binaries.</p>
                </div>

                <SettingsRow title="App Version &amp; Repository" desc="Iris Desktop Overlay utility releases are distributed via GitHub Releases.">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="mono bold" style={{ color: "var(--cyan)" }}>
                      {displayVersion ? `Iris v${displayVersion}` : "Iris"}
                    </span>
                    {updateStatus.status === "upToDate" && (
                      <span className="tag mono ok" style={{ fontSize: "11px" }}>✓ Latest Release</span>
                    )}
                    {updateStatus.status === "available" && (
                      <span className="tag mono" style={{ color: "var(--cyan)", borderColor: "var(--cyan)", fontSize: "11px" }}>
                        ★ Update Available (v{updateStatus.version})
                      </span>
                    )}
                    {updateStatus.status === "downloading" && (
                      <span className="tag mono" style={{ color: "var(--purple)", borderColor: "var(--purple)", fontSize: "11px" }}>
                        ↓ Downloading {updateStatus.progress.toFixed(0)}%
                      </span>
                    )}
                    {updateStatus.status === "downloaded" && (
                      <span className="tag mono ok" style={{ borderColor: "var(--emerald)", fontSize: "11px" }}>
                        ✓ Ready to Install (v{updateStatus.version})
                      </span>
                    )}
                    {updateStatus.status === "checking" && (
                      <span className="tag mono" style={{ color: "var(--cyan)", fontSize: "11px" }}>
                        ⟳ Checking GitHub...
                      </span>
                    )}
                    <a href="https://github.com/allnighter51/Iris/releases" target="_blank" rel="noreferrer" className="tag mono" style={{ textDecoration: "none", cursor: "pointer" }}>
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
                  {updateStatus.status === "available" && (
                    <button className="btn primary" onClick={onDownloadUpdate}>
                      ★ Update Now (1-Click Install v{updateStatus.version})
                    </button>
                  )}
                  {updateStatus.status === "downloading" && (
                    <button className="btn primary" disabled>
                      ↓ Downloading v{updateStatus.version}... {updateStatus.progress.toFixed(0)}%
                    </button>
                  )}
                  {updateStatus.status === "downloaded" && (
                    <button className="btn primary" onClick={onRestartUpdate}>
                      ⚡ Restart &amp; Apply Now
                    </button>
                  )}
                </div>
              </div>

              {/* System & Storage Panel */}
              <div
                className="settings-panel"
                style={{ order: hasUpdate ? 2 : 1 }}
              >
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
