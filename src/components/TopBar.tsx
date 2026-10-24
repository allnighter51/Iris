import type { Tab } from "../types";

const TABS: { id: Tab; label: string }[] = [
  { id: "display", label: "Display" },
  { id: "layering", label: "Layering" },
  { id: "vault", label: "Vault" },
  { id: "settings", label: "Settings" },
];

export function TopBar({
  tab,
  setTab,
  active,
  waiting,
  onForceShow,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  active: boolean;
  waiting?: boolean;
  onForceShow?: () => void;
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
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
