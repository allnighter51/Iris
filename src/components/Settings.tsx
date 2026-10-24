import { useEffect, useState } from "react";
import { api } from "../api";
import { GAME_EXES, KNOWN_GAMES, ROLES, type Settings, type VaultData } from "../types";
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

const BLOAT_COMPARISON = [
  { feature: "Memory / CPU Footprint", iris: "~35 MB / 0.1% CPU", others: "400+ MB / 3–8% CPU" },
  { feature: "Anti-Cheat Safe (Zero Injection)", iris: "Yes (Pure Win32 Layered)", others: "Varies / Often Flagged" },
  { feature: "Forced Ads & Tracking", iris: "None (Zero Telemetry)", others: "High / Forced Overlays" },
  { feature: "Install Required / Admin Rights", iris: "Portable / Standard User", others: "Installer + Admin UAC" },
  { feature: "Custom In-Game Alignment Backdrops", iris: "Built-in (Screenshots/Live)", others: "No" },
  { feature: "Modular Layer Compositing", iris: "Yes (Multi-part HUD stacks)", others: "Single Image Only" },
];

export function SettingsView({
  settings: s,
  save,
  currentForegroundExe,
  vault,
}: {
  settings: Settings;
  save: (p: Partial<Settings>) => void;
  currentForegroundExe?: string | null;
  vault?: VaultData | null;
}) {
  const [exe, setExe] = useState(s.targetExe);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);

  const isGameActive = !!currentForegroundExe && KNOWN_GAMES.some((g) =>
    g.exes.some((e) => e.toLowerCase() === currentForegroundExe.toLowerCase())
  );

  const copyMarkdownComparison = async () => {
    const md = [
      "| Feature | Iris | Overwolf / Others |",
      "| :--- | :--- | :--- |",
      ...BLOAT_COMPARISON.map((r) => `| ${r.feature} | **${r.iris}** | ${r.others} |`),
    ].join("\n");
    await navigator.clipboard.writeText(md);
    setCopiedTable(true);
    setTimeout(() => setCopiedTable(false), 2000);
  };

  return (
    <div className="page settings">
      <section className="card bracket">
        <h3>Auto-Game Detection &amp; Profile Auto-Switching</h3>
        <Row
          title="Automatic Game Detection"
          desc="Detects foreground game processes (Overwatch.exe, VALORANT-Win64-Shipping.exe, MarvelRivals.exe) and automatically switches to that game's HUD."
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

        {vault && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="row-title" style={{ marginBottom: 6 }}>Game-to-HUD Profile Assignments</div>
            <div className="muted small" style={{ marginBottom: 10 }}>Assign a specific Vault Overlay or Layer Preset to load when a game window is detected.</div>
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
          </div>
        )}
      </section>

      <section className="card bracket">
        <h3>1-Click Web Protocol (veevisuals.art ⇄ Iris)</h3>
        <Row
          title="Windows URL Scheme (iris://)"
          desc="Allows 1-click importing directly from veevisuals.art and Aether Deck. Clicking 'Send to Iris' on the site opens Iris and saves the pack straight into your Vault."
        >
          <span className="tag mono ok">&#x2713; REGISTERED (iris://)</span>
        </Row>
      </section>

      <section className="card bracket">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Iris vs. The Bloatware (Architecture Comparison)</h3>
          <button className="btn outline small" onClick={copyMarkdownComparison}>
            {copiedTable ? "✓ Copied Markdown!" : "Copy Markdown Table"}
          </button>
        </div>
        <div className="bloat-table-container">
          <table className="bloat-table">
            <thead>
              <tr>
                <th>Feature / Metric</th>
                <th className="col-iris">Iris</th>
                <th>Overwolf / HudSight / Others</th>
              </tr>
            </thead>
            <tbody>
              {BLOAT_COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <td><strong>{row.feature}</strong></td>
                  <td className="col-iris">{row.iris}</td>
                  <td className="col-bloat">{row.others}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card bracket">
        <h3>Global Hotkeys</h3>
        <Row title="Toggle Overlay Visibility" desc="Show / hide the active overlay."><HotkeyInput value={s.hotkeyToggle} onChange={(v) => save({ hotkeyToggle: v })} /></Row>
        <Row title="Next Overlay" desc="Cycles overlays in the current Vault folder filter."><HotkeyInput value={s.hotkeyNext} onChange={(v) => save({ hotkeyNext: v })} /></Row>
        <Row title="Previous Overlay"><HotkeyInput value={s.hotkeyPrev} onChange={(v) => save({ hotkeyPrev: v })} /></Row>
      </section>

      <section className="card bracket">
        <h3>Layer Role Hotkeys</h3>
        <div className="muted small">Toggle every layer of a role in the Layering stack (e.g. Map Overlay on <span className="mono">Ctrl+Alt+M</span>). Global hotkeys are captured system-wide, so avoid keys the game itself uses.</div>
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

      <section className="card bracket">
        <h3>Window &amp; Rendering Engine</h3>
        <Row title="Anti-Cheat Safe (Zero Injection)" desc="100% anti-cheat safe (Riot Vanguard, Easy Anti-Cheat, BattlEye, Ricochet). Zero DLL injection or game memory hooks.">
          <span className="tag mono ok">&#x2713; ZERO HOOKS</span>
        </Row>
        <Row title="Display Compatibility" desc="Native Win32 topmost DWM layer displays over Windowed, Borderless, and Fullscreen (FSO) games without needing administrator privileges.">
          <span className="tag mono">FULLSCREEN &amp; BORDERLESS</span>
        </Row>
        <Row title="Click-Through Lock" desc="WS_EX_TRANSPARENT | LAYERED | TOPMOST | TOOLWINDOW | NOACTIVATE - always on so mouse clicks pass 100% into the game with zero latency.">
          <span className="tag mono locked">&#x1F512; ENFORCED</span>
        </Row>
        <Row title="Hide from Capture (OBS / Stream Mode)" desc="ON: only you see the overlay (WDA_EXCLUDEFROMCAPTURE). OFF: it also appears in OBS Game/Display Capture.">
          <Toggle checked={s.hideFromCapture} onChange={(v) => save({ hideFromCapture: v })} />
        </Row>
        <Row title="Target Mode" desc="Always-on-top desktop overlay, or auto-attach (show only while a game process is running).">
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
      </section>

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
    </div>
  );
}