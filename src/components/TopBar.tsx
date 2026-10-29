import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tab, UpdateStatus } from "../types";
import { Toggle } from "./ui";

interface TopBarProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  active: boolean;
  waiting?: boolean;
  onForceShow?: () => void;
  hasUpdate?: boolean;
  overlayEnabled?: boolean;
  onToggleOverlay?: (enabled: boolean) => void;
  equippedName?: string | null;
  activeGame?: string | null;
  updateStatus?: UpdateStatus;
  onUpdateNow?: () => void;
  onRestartUpdate?: () => void;
}

const TABS: { id: Tab; label: string; desc: string; icon: ReactNode }[] = [
  {
    id: "vault",
    label: "Vault",
    desc: "Library & Packs",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "display",
    label: "Display",
    desc: "Position & Scale",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" />
      </svg>
    ),
  },
  {
    id: "layering",
    label: "Layering",
    desc: "Multi-HUD Studio",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    desc: "Profiles & Keybinds",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export function TopBar({
  tab,
  setTab,
  active,
  waiting,
  onForceShow,
  hasUpdate,
  overlayEnabled = false,
  onToggleOverlay,
  equippedName,
  activeGame,
  updateStatus,
  onUpdateNow,
  onRestartUpdate,
}: TopBarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        brandRef.current &&
        !brandRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [popoverOpen]);

  return (
    <header className="topbar">
      <div className="brand" ref={brandRef}>
        <button
          type="button"
          className={`brand-trigger-btn${popoverOpen ? " open" : ""}`}
          onClick={() => setPopoverOpen((v) => !v)}
          title={popoverOpen ? "Close Command Center (Esc)" : "Iris Quick-Launch Command Center"}
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
        >
          <span className="brand-mark-wrap">
            <span className="brand-mark" />
            <span className="brand-glow-ring" />
          </span>
          <span className="brand-name">Iris</span>
          <span className="brand-script">by venus visuals</span>
          <span className="brand-caret">▾</span>
        </button>
      </div>

      {popoverOpen && (
        <div
          ref={popoverRef}
          className="homescreen-popover"
          role="dialog"
          aria-label="Iris Miniature Homescreen"
        >
          <div className="hs-popover-header">
            <div className="hs-logo-wrap">
              <div className="hs-logo-ambient" />
              <span className="brand-mark hs-logo" />
            </div>
            <div className="hs-title-block">
              <div className="hs-title">IRIS</div>
              <div className="hs-subtitle" title={equippedName ? `Equipped: ${equippedName}` : "HUD Engine Ready"}>
                {equippedName ? `⚡ ${equippedName}` : "HUD Engine Ready"}
              </div>
            </div>
          </div>

          <div className="hs-bento-grid">
            {TABS.map((t) => {
              const isSelected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`hs-bento-tile${isSelected ? " active" : ""}`}
                  onClick={() => {
                    setTab(t.id);
                    setPopoverOpen(false);
                  }}
                >
                  <span className="hs-bento-tile-icon">{t.icon}</span>
                  <span className="hs-bento-tile-title">{t.label}</span>
                  <span className="hs-bento-tile-desc">{t.desc}</span>
                  {t.id === "settings" && hasUpdate && <span className="hs-badge-dot" title="Update available" />}
                </button>
              );
            })}
          </div>

          <div className="hs-popover-footer">
            <div className="hs-toggle-info">
              <span className={`hs-status-dot ${overlayEnabled ? "live" : ""}`} />
              <div>
                <div className="hs-toggle-title">Active Overlay</div>
                <div className="hs-toggle-sub mono">
                  {overlayEnabled ? (active ? "PROJECTING" : "STANDBY") : "DISABLED"}
                </div>
              </div>
            </div>
            <Toggle checked={Boolean(overlayEnabled)} onChange={(v) => onToggleOverlay?.(v)} />
          </div>
        </div>
      )}

      <div
        className={`status-pill${active ? " live" : waiting ? " waiting" : ""}`}
        style={waiting && onForceShow ? { cursor: "pointer" } : undefined}
        onClick={waiting && onForceShow ? onForceShow : undefined}
        title={waiting && onForceShow ? "Click to force show overlay on screen now" : undefined}
      >
        {active
          ? (activeGame ? `● OVERLAY ACTIVE (${activeGame.toUpperCase()})` : "● OVERLAY ACTIVE")
          : waiting
          ? "○ WAITING FOR GAME (CLICK TO FORCE SHOW)"
          : "○ STANDBY"}
      </div>

      <div className="topbar-right">
        {updateStatus?.status === "available" && (
          <button
            type="button"
            className="topbar-update-btn available pulse"
            onClick={onUpdateNow}
            title={`Iris v${updateStatus.version} is available. Click to download and install now.`}
          >
            <span className="topbar-update-star">★</span>
            <span className="topbar-update-label">Update to v{updateStatus.version}</span>
            <span className="topbar-update-pill-action">Update Now</span>
          </button>
        )}

        {updateStatus?.status === "downloading" && (
          <div
            className="topbar-update-btn downloading"
            title={`Downloading Iris v${updateStatus.version}... ${updateStatus.progress.toFixed(0)}%`}
          >
            <div
              className="topbar-update-btn-progress-fill"
              style={{ width: `${Math.max(6, Math.min(100, updateStatus.progress))}%` }}
            />
            <span className="topbar-update-star spin">⟳</span>
            <span className="topbar-update-label">
              Downloading v{updateStatus.version}... {updateStatus.progress.toFixed(0)}%
            </span>
          </div>
        )}

        {updateStatus?.status === "downloaded" && (
          <button
            type="button"
            className="topbar-update-btn downloaded pulse"
            onClick={onRestartUpdate}
            title={`Iris v${updateStatus.version} downloaded! Click to restart and apply.`}
          >
            <span className="topbar-update-star">⚡</span>
            <span className="topbar-update-label">Restart to Apply v{updateStatus.version}</span>
            <span className="topbar-update-pill-action">Restart Now</span>
          </button>
        )}

        <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
            style={{ position: "relative" }}
          >
            {t.label}
            {t.id === "settings" && hasUpdate && (
              <span
                style={{
                  position: "absolute",
                  top: 7,
                  right: 8,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--cyan)",
                  boxShadow: "0 0 8px var(--cyan)",
                }}
                title="Update available"
              />
            )}
          </button>
        ))}
      </nav>
      </div>
    </header>
  );
}
