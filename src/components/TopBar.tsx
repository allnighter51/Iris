import type { Tab } from "../types";

const TABS: { id: Tab; label: string }[] = [
  { id: "vault", label: "Vault" },
  { id: "display", label: "Display" },
  { id: "layering", label: "Layering" },
  { id: "settings", label: "Settings" },
];

export function TopBar({
  tab,
  setTab,
  active,
  waiting,
  onForceShow,
  hasUpdate,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  active: boolean;
  waiting?: boolean;
  onForceShow?: () => void;
  hasUpdate?: boolean;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Iris</span>
        <span className="brand-script">by venus visuals</span>
      </div>
      <div
        className={`status-pill${active ? " live" : waiting ? " waiting" : ""}`}
        style={waiting && onForceShow ? { cursor: "pointer" } : undefined}
        onClick={waiting && onForceShow ? onForceShow : undefined}
        title={waiting && onForceShow ? "Click to force show overlay on screen now" : undefined}
      >
        {active ? "● OVERLAY ACTIVE" : waiting ? "○ WAITING FOR GAME (CLICK TO FORCE SHOW)" : "○ STANDBY"}
      </div>
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
    </header>
  );
}
