import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { api } from "./api";
import {
  DEFAULT_OVERLAY, DEFAULT_TRANSFORM, ELEMENT_TAGS, KNOWN_GAMES,
  type CanvasRes, type CompositePreset, type FseStatus, type Layer, type MonitorInfo,
  type OverlayState, type OverlayStatus, type Settings, type Tab,
  type UpdateStatus, type VaultData, type VaultItem,
} from "./types";
import { filterItems } from "./util";
import { fromPreset, newLayer, parsePresetPayload, toScene } from "./layers";
import { loadUsage, saveUsage, type UsageStats } from "./usage";
import { sendTelemetryEvent } from "./services/telemetry";
import { TopBar } from "./components/TopBar";
import { Vault } from "./components/Vault";
import { Display } from "./components/Display";
import { Layering } from "./components/Layering";
import { SettingsView, type SettingsTab } from "./components/Settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("vault");
  const [vault, setVault] = useState<VaultData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [overlay, setOverlay] = useState<OverlayState>(DEFAULT_OVERLAY);
  const [filter, setFilter] = useState("All");
  const [status, setStatus] = useState<OverlayStatus>({ enabled: false, visible: false, gameRunning: false });
  const [ready, setReady] = useState(false);
  const [currentForegroundExe, setCurrentForegroundExe] = useState<string | null>(null);
  const [fseStatus, setFseStatus] = useState<FseStatus>({ isFse: false, gameExe: null });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" });
  const [toast, setToast] = useState<{
    title: string;
    sub: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
    persistent?: boolean;
  } | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsTab | undefined>(undefined);

  const vaultRef = useRef(vault); vaultRef.current = vault;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const lastAutoGame = useRef<string | null>(null);
  const usageStatsRef = useRef<UsageStats>(loadUsage());
  const [usageStats, setUsageStats] = useState<UsageStats>(() => usageStatsRef.current);
  const lastActiveOverlayIdRef = useRef<string | null>(null);

  const [telemetryPaused, setTelemetryPaused] = useState<boolean>(() => {
    try { return localStorage.getItem("iris_telemetry_paused") === "true"; } catch { return false; }
  });

  const toggleTelemetry = useCallback(() => {
    setTelemetryPaused((prev) => {
      const next = !prev;
      try { localStorage.setItem("iris_telemetry_paused", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const updateUsage = useCallback((fn: (cur: UsageStats) => UsageStats) => {
    const next = fn(usageStatsRef.current);
    usageStatsRef.current = next;
    saveUsage(next);
    setUsageStats(next);
  }, []);

  const resetUsageStats = useCallback(() => {
    updateUsage(() => ({ totalAppTimeSeconds: 0, totalSwaps: 0, totalUploads: vaultRef.current?.items.length ?? 0, overlayTime: {} }));
  }, [updateUsage]);

  const recordSwap = useCallback((newId: string | null) => {
    if (!newId || telemetryPaused) return;
    if (lastActiveOverlayIdRef.current && lastActiveOverlayIdRef.current !== newId) {
      updateUsage((c) => ({ ...c, totalSwaps: c.totalSwaps + 1 }));
    }
    lastActiveOverlayIdRef.current = newId;
  }, [telemetryPaused, updateUsage]);

  const recordUpload = useCallback(() => {
    if (!telemetryPaused) updateUsage((c) => ({ ...c, totalUploads: c.totalUploads + 1 }));
  }, [telemetryPaused, updateUsage]);

  const [layers, setLayers] = useState<Layer[]>([]);
  const [live, setLive] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const overlayRef = useRef(overlay); overlayRef.current = overlay;
  const liveRef = useRef(live); liveRef.current = live;
  const activePresetIdRef = useRef(activePresetId); activePresetIdRef.current = activePresetId;
  const [appVersion, setAppVersion] = useState<string>("");
  const appVersionRef = useRef("");
  const [canvasRes, setCanvasResState] = useState<CanvasRes | null>(() => {
    try { const raw = localStorage.getItem("iris_canvas_res"); return raw ? (JSON.parse(raw) as CanvasRes) : null; }
    catch { return null; }
  });

  const setCanvasRes = useCallback((r: CanvasRes | null) => {
    setCanvasResState(r);
    try {
      if (r) localStorage.setItem("iris_canvas_res", JSON.stringify(r));
      else localStorage.removeItem("iris_canvas_res");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (telemetryPaused) return;
    const timer = setInterval(() => {
      const cur = usageStatsRef.current;
      const nextAppTime = cur.totalAppTimeSeconds + 1;
      const nextOverlayTime = { ...cur.overlayTime };
      if (overlay.enabled) {
        const activeKey = live && activePresetId ? `preset:${activePresetId}` : overlay.itemId;
        if (activeKey) nextOverlayTime[activeKey] = (nextOverlayTime[activeKey] || 0) + 1;
      }
      const nextStats: UsageStats = { ...cur, totalAppTimeSeconds: nextAppTime, overlayTime: nextOverlayTime };
      usageStatsRef.current = nextStats;
      if (nextAppTime % 5 === 0) saveUsage(nextStats);
      if (tab === "settings" || nextAppTime % 10 === 0) setUsageStats(nextStats);
    }, 1000);
    return () => { clearInterval(timer); saveUsage(usageStatsRef.current); };
  }, [overlay.enabled, overlay.itemId, live, activePresetId, tab, telemetryPaused]);

  useEffect(() => { if (tab === "settings") setUsageStats({ ...usageStatsRef.current }); }, [tab]);

  useEffect(() => {
    Promise.all([api.vaultLoad(), api.settingsGet(), api.listMonitors(), api.updaterGetStatus()])
      .then(([v, s, m, u]) => {
        setVault(v);
        if (v && v.items.length > usageStatsRef.current.totalUploads) {
          updateUsage((c) => ({ ...c, totalUploads: v.items.length }));
        }
        setSettings(s);
        setMonitors(m);
        if (u) {
          setUpdateStatus(u);
          if (u.status === "available") {
            const ver = u.version;
            setToast({
              title: `✨ Iris Update v${ver} Available`,
              sub: "Download & install now in a single click, or review release notes.",
              actionLabel: "Update Now",
              onAction: () => {
                setUpdateStatus({ status: "downloading", version: ver, progress: 0, downloaded: 0 });
                api.updaterDownloadAndInstall().catch(console.error);
              },
              secondaryActionLabel: "View Notes",
              onSecondaryAction: () => {
                setSettingsSubTab("system");
                setTab("settings");
              },
              persistent: true,
            });
          }
        }
        api.overlayGetFseStatus().then(setFseStatus).catch(() => {});
        setReady(true);
        const fetchVer = api.getAppVersion().catch(() => getVersion());
        fetchVer
          .then((ver) => {
            setAppVersion(ver);
            appVersionRef.current = ver;
            sendTelemetryEvent({
              event: "app_launch",
              appVersion: ver,
              resolution: `${window.screen.width}x${window.screen.height}`,
            }, s?.telemetryEnabled ?? true);
          })
          .catch(() => {
            sendTelemetryEvent({
              event: "app_launch",
              resolution: `${window.screen.width}x${window.screen.height}`,
            }, s?.telemetryEnabled ?? true);
          });
      })
      .catch(() => setReady(true));

    const subs = [
      listen<OverlayStatus>("overlay-status", (e) => {
        setStatus(e.payload);
        setOverlay((o) => (o.enabled === e.payload.enabled ? o : { ...o, enabled: e.payload.enabled }));
      }),
      listen<string>("toggle-layer-role", (e) =>
        setLayers((ls) => {
          const same = ls.filter((l) => l.role === e.payload);
          if (!same.length) return ls;
          const show = !same.some((l) => l.visible);
          return ls.map((l) => (l.role === e.payload ? { ...l, visible: show } : l));
        }),
      ),
      listen<UpdateStatus>("updater-status", (e) => {
        setUpdateStatus(e.payload);
        if (e.payload.status === "downloaded") {
          setToast({
            title: `✓ Iris v${e.payload.version} Ready to Apply`,
            sub: "Update installed! Relaunching automatically, or click Restart Now.",
            actionLabel: "Restart Now",
            onAction: () => api.updaterRestart(),
            persistent: true,
          });
          setTimeout(() => {
            api.updaterRestart().catch(() => {});
          }, 1500);
        }
      }),
      listen<FseStatus>("overlay-fse-status", (e) => setFseStatus(e.payload)),
      listen<string>("navigate-tab", (e) => setTab(e.payload as Tab)),
      listen<string>("updater-available-toast", (e) => {
        const ver = typeof e.payload === "string" ? e.payload : String(e.payload);
        setToast({
          title: `✨ Iris Update v${ver} Available`,
          sub: "Download & install now in a single click, or review release notes.",
          actionLabel: "Update Now",
          onAction: () => {
            setUpdateStatus((s) => (s.status === "available" ? { status: "downloading", version: ver, progress: 0, downloaded: 0 } : s));
            api.updaterDownloadAndInstall().catch(console.error);
          },
          secondaryActionLabel: "View Notes",
          onSecondaryAction: () => {
            setSettingsSubTab("system");
            setTab("settings");
          },
          persistent: true,
        });
      }),
    ];
    return () => { subs.forEach((p) => p.then((f) => f())); };
  }, [updateUsage]);

  useEffect(() => {
    if (!ready || (settings && settings.telemetryEnabled === false)) return;

    const runHeartbeat = () => {
      const v = vaultRef.current;
      const curOverlay = overlayRef.current;
      const isLive = liveRef.current;
      let gameCategory: string | null = null;
      let elementType: string | null = null;

      if (curOverlay.enabled && v) {
        if (isLive) {
          const preset = v.presets.find((p) => p.id === activePresetIdRef.current);
          gameCategory = preset?.game ?? "Custom";
          elementType = "Full HUD";
        } else if (curOverlay.itemId) {
          const item = v.items.find((i) => i.id === curOverlay.itemId);
          if (item) {
            gameCategory = item.game;
            elementType = ELEMENT_TAGS.find((t) => t.id === item.tag)?.label ?? item.tag ?? "Overlay";
          }
        }
      }

      sendTelemetryEvent({
        event: "heartbeat",
        appVersion: appVersionRef.current,
        gameCategory,
        elementType,
      }, settingsRef.current?.telemetryEnabled ?? true);
    };

    const timer = setInterval(runHeartbeat, 600_000);
    return () => clearInterval(timer);
  }, [ready, settings?.telemetryEnabled]);

  useEffect(() => {
    if (!ready || !vault) return;
    const m = monitors[overlay.monitor] ?? monitors[0];
    const factor = canvasRes && m ? Math.min(m.width / canvasRes.w, m.height / canvasRes.h) : 1;
    const state: OverlayState = live ? { ...overlay, path: null, scene: toScene(layers, vault, factor) } : { ...overlay, scene: [] };
    api.overlayApply(state).catch(console.error);
  }, [overlay, layers, live, vault, ready, canvasRes, monitors]);

  useEffect(() => {
    if (vault && overlay.itemId && !vault.items.some((i) => i.id === overlay.itemId)) {
      setOverlay((o) => ({ ...o, itemId: null, path: null, enabled: false }));
    }
  }, [vault, overlay.itemId]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    const cur = await api.settingsGet();
    setSettings(await api.settingsSave({ ...cur, ...patch }));
  }, []);

  const loadItem = useCallback((item: VaultItem, goToDisplay = true) => {
    if (!vault) return;
    recordSwap(item.id);
    setLive(false);
    try {
      const raw = localStorage.getItem("iris_recent_display_ids");
      const list = raw ? JSON.parse(raw) : [];
      const updated = [item.id, ...list.filter((x: string) => x !== item.id)].slice(0, 8);
      localStorage.setItem("iris_recent_display_ids", JSON.stringify(updated));
    } catch { /* ignore */ }
    setOverlay((o) => ({
      ...o, enabled: true, itemId: item.id, path: `${vault.assetsDir}\\${item.file}`,
      width: item.width, height: item.height, transform: item.transform ?? DEFAULT_TRANSFORM,
    }));
    if (goToDisplay) setTab("display");
    sendTelemetryEvent({
      event: "overlay_equipped",
      appVersion: appVersionRef.current,
      gameCategory: item.game,
      elementType: ELEMENT_TAGS.find((t) => t.id === item.tag)?.label ?? item.tag ?? "Overlay",
    }, settingsRef.current?.telemetryEnabled ?? true);
  }, [vault, recordSwap]);

  const addLayer = useCallback((item: VaultItem, at?: { x: number; y: number }) => {
    const layer = newLayer(item, at);
    setLayers((ls) => [layer, ...ls]);
    return layer.id;
  }, []);

  const sendToStack = useCallback((item: VaultItem) => { addLayer(item); setTab("layering"); }, [addLayer]);

  const loadPreset = useCallback((p: CompositePreset, pushLive: boolean, goToLayering = false) => {
    recordSwap(`preset:${p.id}`);
    setLayers(fromPreset(p.layers));
    setActivePresetId(p.id);
    if (p.refW && p.refH) setCanvasRes({ w: p.refW, h: p.refH });
    if (pushLive) { setLive(true); setOverlay((o) => ({ ...o, enabled: true })); }
    if (goToLayering) setTab("layering");
    sendTelemetryEvent({
      event: "overlay_equipped",
      appVersion: appVersionRef.current,
      gameCategory: p.game ?? "Custom",
      elementType: "Full HUD",
    }, settingsRef.current?.telemetryEnabled ?? true);
  }, [recordSwap, setCanvasRes]);

  const pushComposite = useCallback(() => {
    recordSwap(activePresetId ? `preset:${activePresetId}` : "composite_live");
    setLive(true);
    setOverlay((o) => ({ ...o, enabled: true }));
    if (settingsRef.current?.targetMode === "game" && !status.gameRunning) saveSettings({ targetMode: "topmost" });
    const p = vaultRef.current?.presets.find((x) => x.id === activePresetId);
    sendTelemetryEvent({
      event: "overlay_equipped",
      appVersion: appVersionRef.current,
      gameCategory: p?.game ?? "Custom",
      elementType: "Full HUD",
    }, settingsRef.current?.telemetryEnabled ?? true);
  }, [activePresetId, recordSwap, status.gameRunning, saveSettings]);

  const handleUpdateNow = useCallback(async () => {
    try {
      setUpdateStatus((s) => (s.status === "available" ? { status: "downloading", version: s.version, progress: 0, downloaded: 0 } : s));
      await api.updaterDownloadAndInstall();
    } catch (err) {
      console.error("Failed to download and install update:", err);
      setToast({
        title: "Update Download Failed",
        sub: String(err),
        actionLabel: "Retry",
        onAction: () => handleUpdateNow(),
      });
    }
  }, []);

  const handleRestartUpdate = useCallback(() => {
    api.updaterRestart();
  }, []);

  useEffect(() => {
    const un = listen<string | null>("foreground-process-changed", (e) => {
      const fg = e.payload;
      setCurrentForegroundExe(fg);
      if (!fg) return;
      const s = settingsRef.current, v = vaultRef.current;
      if (!s || s.autoGameSwitch === false || !v) return;

      const matchedGame = KNOWN_GAMES.find((g) => g.exes.some((exe) => exe.toLowerCase() === fg.toLowerCase()));
      if (!matchedGame) { lastAutoGame.current = null; return; }
      if (lastAutoGame.current === matchedGame.name) return;
      lastAutoGame.current = matchedGame.name;

      const applyPreset = (p: CompositePreset) => {
        loadPreset(p, true, false);
        setToast({ title: `● Auto-Switched to ${matchedGame.label}`, sub: `Loaded loadout "${p.name}"` });
      };
      const applyItem = (it: VaultItem) => {
        loadItem(it, false);
        setToast({ title: `● Auto-Switched to ${matchedGame.label}`, sub: `Loaded overlay "${it.name}"` });
      };

      const assigned = s.gameProfiles?.[matchedGame.name];
      if (assigned?.startsWith("preset:")) {
        const p = v.presets.find((x) => x.id === assigned.slice(7));
        if (p) return applyPreset(p);
      } else if (assigned?.startsWith("item:")) {
        const it = v.items.find((x) => x.id === assigned.slice(5));
        if (it) return applyItem(it);
      }

      const matchingPreset = v.presets.find((p) => p.game === matchedGame.name);
      if (matchingPreset) return applyPreset(matchingPreset);

      const matchingItem = v.items.find((i) => i.game === matchedGame.name && i.favorite) || v.items.find((i) => i.game === matchedGame.name);
      if (matchingItem) applyItem(matchingItem);
    });
    return () => { un.then((f) => f()); };
  }, [loadPreset, loadItem]);

  useEffect(() => {
    const un = listen<string>("iris-protocol-url", async (e) => {
      const raw = e.payload.trim();
      if (!raw.startsWith("iris://")) return;
      try {
        const parsedUrl = new URL(raw.replace(/^iris:\/\//i, "https://iris/"));
        const action = parsedUrl.pathname.replace(/^\//, "");
        if (action === "import") {
          const downloadUrl = parsedUrl.searchParams.get("url");
          const name = parsedUrl.searchParams.get("name") || "Imported Design";
          const game = parsedUrl.searchParams.get("game") || "Other";
          if (!downloadUrl) return;
          setToast({ title: "Downloading Pack from veevisuals.art…", sub: name });
          const res = await fetch(downloadUrl);
          const buf = await res.arrayBuffer();
          const bmp = await createImageBitmap(new Blob([buf]));
          const { width, height } = bmp;
          bmp.close();
          const importedItem = await api.importAsset(new Uint8Array(buf), { name, game, folder: "", tag: "", width, height });
          recordUpload();
          setVault(await api.vaultLoad());
          setToast({
            title: "✓ Installed from veevisuals.art!",
            sub: `${name} (${game}) is ready in your Vault`,
            actionLabel: "Equip Now",
            onAction: () => loadItem(importedItem, true),
          });
        } else if (action === "preset") {
          const parsed = parsePresetPayload(parsedUrl.searchParams.get("data") || "", vaultRef.current?.items || []);
          if (parsed) {
            setLayers(() => parsed.layers);
            setActivePresetId(null);
            setTab("layering");
            setToast({ title: "✓ Loadout Loaded from veevisuals.art", sub: `${parsed.name} (${parsed.layers.length} layers)` });
          }
        }
      } catch (err) { console.error("Failed to process iris protocol:", err); }
    });
    return () => { un.then((f) => f()); };
  }, [loadItem, recordUpload]);

  useEffect(() => {
    if (!toast || toast.persistent) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const cycleRef = useRef<(dir: number) => void>(() => {});
  cycleRef.current = (dir) => {
    if (!vault) return;
    const list = filterItems(vault.items, filter);
    if (!list.length) return;
    const idx = list.findIndex((i) => i.id === overlay.itemId);
    const next = list[(((idx === -1 ? (dir > 0 ? -1 : 0) : idx) + dir) % list.length + list.length) % list.length];
    loadItem(next, false);
  };
  useEffect(() => {
    const un = listen<number>("cycle-overlay", (e) => cycleRef.current(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  if (!vault || !settings) return <div className="boot">INITIALIZING IRIS…</div>;
  const activeItem = vault.items.find((i) => i.id === overlay.itemId) ?? null;
  const hasUpdate = updateStatus.status === "available" || updateStatus.status === "downloading" || updateStatus.status === "downloaded";
  const equippedName = live ? (vault.presets.find((p) => p.id === activePresetId)?.name || "Composite Loadout") : (activeItem?.name || null);

  return (
    <div className="app">
      <TopBar
        tab={tab}
        setTab={setTab}
        active={status.visible}
        waiting={overlay.enabled && !status.visible}
        onForceShow={() => saveSettings({ targetMode: "force_on_screen" })}
        hasUpdate={hasUpdate}
        overlayEnabled={overlay.enabled}
        onToggleOverlay={(enabled) => {
          setOverlay((o) => ({ ...o, enabled }));
          if (enabled && (settings?.targetMode === "game" || settings?.targetMode === "smart_detect") && !status.gameRunning) {
            saveSettings({ targetMode: "force_on_screen" });
          }
        }}
        equippedName={equippedName}
        activeGame={status.activeGame}
        updateStatus={updateStatus}
        onUpdateNow={handleUpdateNow}
        onRestartUpdate={handleRestartUpdate}
      />
      <main>
        {tab === "vault" && (
          <Vault
            vault={vault} setVault={setVault} filter={filter} setFilter={setFilter} activeId={overlay.itemId}
            onLoad={loadItem} onSendToStack={sendToStack} onLoadPreset={(p) => loadPreset(p, true, true)} onUpload={recordUpload}
          />
        )}
        {tab === "display" && (
          <Display
            vault={vault} setVault={setVault} item={activeItem} overlay={overlay} setOverlay={setOverlay}
            monitors={monitors} status={status} goVault={() => setTab("vault")}
            goLayering={() => setTab("layering")}
            goSettings={() => setTab("settings")}
            compositeLive={live}
            compositeLayersCount={layers.filter((l) => l.visible).length}
            stopComposite={() => setLive(false)} settings={settings} saveSettings={saveSettings}
            onLoadItem={(it) => loadItem(it, true)}
          />
        )}
        {tab === "layering" && (
          <Layering
            vault={vault} setVault={setVault} layers={layers} setLayers={setLayers} addLayer={addLayer}
            live={live} setLive={setLive} push={pushComposite} monitors={monitors} monitor={overlay.monitor}
            setMonitor={(i) => setOverlay((o) => ({ ...o, monitor: i }))} settings={settings}
            activePresetId={activePresetId} setActivePresetId={setActivePresetId}
            loadPreset={(p, push) => loadPreset(p, push)} canvasRes={canvasRes} setCanvasRes={setCanvasRes}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            settings={settings} save={saveSettings} currentForegroundExe={currentForegroundExe} vault={vault}
            usageStats={usageStats} activeOverlayItemId={overlay.itemId} isTelemetryPaused={telemetryPaused}
            onToggleTelemetry={toggleTelemetry} onResetTelemetry={resetUsageStats}
            onEquipItem={(item) => { loadItem(item, true); setToast({ title: "● Overlay Equipped", sub: `Equipped "${item.name}" to display` }); }}
            onEquipPreset={(p) => { loadPreset(p, true, true); setToast({ title: "● Loadout Equipped", sub: `Equipped loadout "${p.name}"` }); }}
            updateStatus={updateStatus}
            appVersion={appVersion}
            onCheckUpdate={() => api.updaterCheck().catch(console.error)}
            onDownloadUpdate={handleUpdateNow}
            onRestartUpdate={handleRestartUpdate}
            monitors={monitors}
            currentMonitor={overlay.monitor}
            onSelectMonitor={(idx) => setOverlay((o) => ({ ...o, monitor: idx }))}
            fseStatus={fseStatus}
            onDismissFse={() => setFseStatus({ isFse: false, gameExe: null })}
            status={status}
            targetSubTab={settingsSubTab}
            onClearTargetSubTab={() => setSettingsSubTab(undefined)}
          />
        )}
      </main>

      {toast && (
        <div className="toast-banner">
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-sub">{toast.sub}</div>
          </div>
          {toast.secondaryActionLabel && toast.onSecondaryAction && (
            <button
              type="button"
              className="btn outline small"
              onClick={() => {
                toast.onSecondaryAction!();
                setToast(null);
              }}
            >
              {toast.secondaryActionLabel}
            </button>
          )}
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className="btn primary small"
              onClick={() => {
                toast.onAction!();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" className="btn outline small num-btn" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
