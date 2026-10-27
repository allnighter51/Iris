import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import {
  DEFAULT_OVERLAY,
  DEFAULT_TRANSFORM,
  KNOWN_GAMES,
  fxOf,
  type CanvasRes,
  type CompositePreset,
  type Layer,
  type MonitorInfo,
  type OverlayState,
  type OverlayStatus,
  type Settings,
  type Tab,
  type UpdateStatus,
  type VaultData,
  type VaultItem,
} from "./types";
import { filterItems } from "./util";
import { fromPreset, newLayer, toScene, uid } from "./layers";
import { loadUsage, saveUsage, type UsageStats } from "./usage";
import { TopBar } from "./components/TopBar";
import { Vault } from "./components/Vault";
import { Display } from "./components/Display";
import { Layering } from "./components/Layering";
import { SettingsView } from "./components/Settings";

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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: "idle" });
  const [toast, setToast] = useState<{
    title: string;
    sub: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastAutoGame = useRef<string | null>(null);

  // Usage Telemetry (time, swaps, uploads, favorite overlay)
  const usageStatsRef = useRef<UsageStats>(loadUsage());
  const [usageStats, setUsageStats] = useState<UsageStats>(() => usageStatsRef.current);
  const lastActiveOverlayIdRef = useRef<string | null>(null);

  const recordSwap = useCallback((newId: string | null) => {
    if (!newId) return;
    if (lastActiveOverlayIdRef.current && lastActiveOverlayIdRef.current !== newId) {
      const next: UsageStats = {
        ...usageStatsRef.current,
        totalSwaps: usageStatsRef.current.totalSwaps + 1,
      };
      usageStatsRef.current = next;
      saveUsage(next);
      setUsageStats(next);
    }
    lastActiveOverlayIdRef.current = newId;
  }, []);

  const recordUpload = useCallback(() => {
    const next: UsageStats = {
      ...usageStatsRef.current,
      totalUploads: usageStatsRef.current.totalUploads + 1,
    };
    usageStatsRef.current = next;
    saveUsage(next);
    setUsageStats(next);
  }, []);

  // Layering studio state (kept here so Vault actions and tab switches preserve it)
  const [layers, setLayers] = useState<Layer[]>([]);
  const [live, setLive] = useState(false); // composite is what the overlay shows
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // authoring resolution for the Layering canvas (null = match the monitor)
  const [canvasRes, setCanvasResState] = useState<CanvasRes | null>(() => {
    try {
      const raw = localStorage.getItem("iris_canvas_res");
      return raw ? (JSON.parse(raw) as CanvasRes) : null;
    } catch {
      return null;
    }
  });
  const setCanvasRes = useCallback((r: CanvasRes | null) => {
    setCanvasResState(r);
    try {
      if (r) localStorage.setItem("iris_canvas_res", JSON.stringify(r));
      else localStorage.removeItem("iris_canvas_res");
    } catch {
      /* ignore */
    }
  }, []);

  // Live app and active overlay telemetry timer
  useEffect(() => {
    const timer = setInterval(() => {
      const cur = usageStatsRef.current;
      const nextAppTime = cur.totalAppTimeSeconds + 1;
      const nextOverlayTime = { ...cur.overlayTime };

      if (overlay.enabled) {
        const activeKey = live && activePresetId ? `preset:${activePresetId}` : overlay.itemId;
        if (activeKey) {
          nextOverlayTime[activeKey] = (nextOverlayTime[activeKey] || 0) + 1;
        }
      }

      const nextStats: UsageStats = {
        ...cur,
        totalAppTimeSeconds: nextAppTime,
        overlayTime: nextOverlayTime,
      };
      usageStatsRef.current = nextStats;

      if (nextAppTime % 5 === 0) {
        saveUsage(nextStats);
      }

      if (tab === "settings" || nextAppTime % 10 === 0) {
        setUsageStats(nextStats);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      saveUsage(usageStatsRef.current);
    };
  }, [overlay.enabled, overlay.itemId, live, activePresetId, tab]);

  useEffect(() => {
    if (tab === "settings") {
      setUsageStats({ ...usageStatsRef.current });
    }
  }, [tab]);

  useEffect(() => {
    Promise.all([api.vaultLoad(), api.settingsGet(), api.listMonitors(), api.updaterGetStatus()]).then(([v, s, m, u]) => {
      setVault(v);
      if (v && v.items.length > usageStatsRef.current.totalUploads) {
        const next = { ...usageStatsRef.current, totalUploads: v.items.length };
        usageStatsRef.current = next;
        saveUsage(next);
        setUsageStats(next);
      }
      setSettings(s);
      setMonitors(m);
      if (u) setUpdateStatus(u);
      setReady(true);
    }).catch(() => {
      // Fail gracefully if any initial call fails
      setReady(true);
    });
    const un1 = listen<OverlayStatus>("overlay-status", (e) => {
      setStatus(e.payload);
      setOverlay((o) => (o.enabled === e.payload.enabled ? o : { ...o, enabled: e.payload.enabled }));
    });
    // global per-role hotkey: toggle every layer of that role
    const un2 = listen<string>("toggle-layer-role", (e) =>
      setLayers((ls) => {
        const same = ls.filter((l) => l.role === e.payload);
        if (!same.length) return ls;
        const show = !same.some((l) => l.visible);
        return ls.map((l) => (l.role === e.payload ? { ...l, visible: show } : l));
      }),
    );
    // updater live status updates
    const un3 = listen<UpdateStatus>("updater-status", (e) => {
      setUpdateStatus(e.payload);
    });
    // tray navigation event
    const un4 = listen<string>("navigate-tab", (e) => {
      setTab(e.payload as Tab);
    });
    // subtle non-intrusive toast when an update is available
    const un5 = listen<string>("updater-available-toast", (e) => {
      setToast({
        title: `✨ Iris Update v${e.payload} Available`,
        sub: "Review release notes & download in Settings.",
        actionLabel: "View in Settings",
        onAction: () => setTab("settings"),
      });
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      un4.then((f) => f());
      un5.then((f) => f());
    };
  }, []);

  // Push to the native window: either the single overlay or the resolved composite.
  useEffect(() => {
    if (!ready || !vault) return;
    // a canvas authored at another resolution is scaled to fit the real monitor
    const m = monitors[overlay.monitor] ?? monitors[0];
    const factor = canvasRes && m ? Math.min(m.width / canvasRes.w, m.height / canvasRes.h) : 1;
    const state: OverlayState = live
      ? { ...overlay, path: null, scene: toScene(layers, vault, factor) }
      : { ...overlay, scene: [] };
    api.overlayApply(state).catch(console.error);
  }, [overlay, layers, live, vault, ready, canvasRes, monitors]);

  // if the active item is deleted, clear the overlay
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

  const loadItem = useCallback(
    (item: VaultItem, goToDisplay = true) => {
      if (!vault) return;
      recordSwap(item.id);
      setLive(false);
      setOverlay((o) => ({
        ...o,
        enabled: true,
        itemId: item.id,
        path: `${vault.assetsDir}\\${item.file}`,
        width: item.width,
        height: item.height,
        transform: item.transform ?? DEFAULT_TRANSFORM,
      }));
      if (goToDisplay) setTab("display");
    },
    [vault, recordSwap],
  );

  /** Append a Vault item on top of the stack (never replaces existing layers). */
  const addLayer = useCallback((item: VaultItem, at?: { x: number; y: number }) => {
    const layer = newLayer(item, at);
    setLayers((ls) => [layer, ...ls]);
    return layer.id;
  }, []);

  const sendToStack = useCallback(
    (item: VaultItem) => {
      addLayer(item);
      setTab("layering");
    },
    [addLayer],
  );

  const loadPreset = useCallback(
    (p: CompositePreset, pushLive: boolean, goToLayering = false) => {
      recordSwap(`preset:${p.id}`);
      setLayers(fromPreset(p.layers));
      setActivePresetId(p.id);
      if (p.refW && p.refH) setCanvasRes({ w: p.refW, h: p.refH });
      if (pushLive) {
        setLive(true);
        setOverlay((o) => ({ ...o, enabled: true }));
      }
      if (goToLayering) setTab("layering");
    },
    [recordSwap, setCanvasRes],
  );

  const pushComposite = useCallback(() => {
    recordSwap(activePresetId ? `preset:${activePresetId}` : "composite_live");
    setLive(true);
    setOverlay((o) => ({ ...o, enabled: true }));
    if (settingsRef.current?.targetMode === "game" && !status.gameRunning) {
      saveSettings({ targetMode: "topmost" });
    }
  }, [activePresetId, recordSwap, status.gameRunning, saveSettings]);

  // Auto-Game Detection & Profile Auto-Switching
  useEffect(() => {
    const un = listen<string | null>("foreground-process-changed", (e) => {
      const fg = e.payload;
      setCurrentForegroundExe(fg);
      if (!fg) return;
      const s = settingsRef.current;
      const v = vaultRef.current;
      if (!s || s.autoGameSwitch === false || !v) return;

      const matchedGame = KNOWN_GAMES.find((g) =>
        g.exes.some((exe) => exe.toLowerCase() === fg.toLowerCase())
      );
      if (!matchedGame) {
        lastAutoGame.current = null;
        return;
      }

      if (lastAutoGame.current === matchedGame.name) return;
      lastAutoGame.current = matchedGame.name;

      // Check user-configured explicit profile mapping
      const assigned = s.gameProfiles?.[matchedGame.name];
      if (assigned) {
        if (assigned.startsWith("preset:")) {
          const pid = assigned.slice("preset:".length);
          const p = v.presets.find((x) => x.id === pid);
          if (p) {
            loadPreset(p, true, false);
            setToast({
              title: `● Auto-Switched to ${matchedGame.label}`,
              sub: `Loaded loadout "${p.name}"`,
            });
            return;
          }
        } else if (assigned.startsWith("item:")) {
          const iid = assigned.slice("item:".length);
          const it = v.items.find((x) => x.id === iid);
          if (it) {
            loadItem(it, false);
            setToast({
              title: `● Auto-Switched to ${matchedGame.label}`,
              sub: `Loaded overlay "${it.name}"`,
            });
            return;
          }
        }
      }

      // Default auto lookup: matching game preset or favorite overlay
      const matchingPreset = v.presets.find((p) => p.game === matchedGame.name);
      if (matchingPreset) {
        loadPreset(matchingPreset, true, false);
        setToast({
          title: `● Auto-Switched to ${matchedGame.label}`,
          sub: `Loaded loadout "${matchingPreset.name}"`,
        });
        return;
      }

      const matchingItem =
        v.items.find((i) => i.game === matchedGame.name && i.favorite) ||
        v.items.find((i) => i.game === matchedGame.name);
      if (matchingItem) {
        loadItem(matchingItem, false);
        setToast({
          title: `● Auto-Switched to ${matchedGame.label}`,
          sub: `Loaded overlay "${matchingItem.name}"`,
        });
      }
    });

    return () => {
      un.then((f) => f());
    };
  }, [loadPreset, loadItem]);

  // 1-Click "Install to Iris" Web Protocol (iris://)
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
          const blob = new Blob([buf]);
          const bmp = await createImageBitmap(blob);
          const importedItem = await api.importAsset(new Uint8Array(buf), {
            name,
            game,
            folder: "",
            tag: "",
            width: bmp.width,
            height: bmp.height,
          });
          recordUpload();
          const updatedVault = await api.vaultLoad();
          setVault(updatedVault);
          setToast({
            title: "✓ Installed from veevisuals.art!",
            sub: `${name} (${game}) is ready in your Vault`,
            actionLabel: "Equip Now",
            onAction: () => loadItem(importedItem, true),
          });
        } else if (action === "preset") {
          const data = parsedUrl.searchParams.get("data") || "";
          let json: any = null;
          let trimmed = data.trim();
          if (trimmed.startsWith("IRIS-PRESET:")) trimmed = trimmed.slice("IRIS-PRESET:".length);
          try {
            json = JSON.parse(decodeURIComponent(escape(atob(trimmed))));
          } catch {
            json = JSON.parse(atob(trimmed));
          }

          if (json && Array.isArray(json.layers)) {
            const v = vaultRef.current;
            const items = v?.items || [];
            const reconstructed: Layer[] = json.layers.map((l: any, idx: number) => {
              let matched = items.find((i) => i.id === l.vaultItemId);
              if (!matched && l.assetFile) matched = items.find((i) => i.file === l.assetFile);
              if (!matched && l.assetName) matched = items.find((i) => i.name.toLowerCase() === l.assetName.toLowerCase());
              if (!matched) matched = items[0];
              return {
                id: uid(),
                vaultItemId: matched?.id ?? (items[0]?.id || "item_1"),
                name: l.name || matched?.name || `Layer ${idx + 1}`,
                role: l.role || "custom",
                zIndex: typeof l.zIndex === "number" ? l.zIndex : idx,
                visible: l.visible !== false,
                locked: !!l.locked,
                x: Number(l.x) || 0,
                y: Number(l.y) || 0,
                scale: Number(l.scale) || 100,
                opacity: typeof l.opacity === "number" ? l.opacity : 100,
                hue: Number(l.hue) || 0,
                fx: fxOf({ fx: l.fx }),
              };
            });
            setLayers(() => reconstructed);
            setActivePresetId(null);
            setTab("layering");
            setToast({
              title: "✓ Loadout Loaded from veevisuals.art",
              sub: `${json.name || "Custom Preset"} (${reconstructed.length} layers)`,
            });
          }
        }
      } catch (err) {
        console.error("Failed to process iris protocol:", err);
      }
    });

    return () => {
      un.then((f) => f());
    };
  }, [loadItem]);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // global hotkeys Next/Previous: cycle through the overlays of the current Vault filter
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
    return () => {
      un.then((f) => f());
    };
  }, []);

  if (!vault || !settings) return <div className="boot">INITIALIZING IRIS…</div>;
  const activeItem = vault.items.find((i) => i.id === overlay.itemId) ?? null;

  const handleCheckUpdate = async () => {
    try {
      await api.updaterCheck();
    } catch (e) {
      console.error("Failed to check for updates:", e);
    }
  };

  const handleDownloadUpdate = async () => {
    try {
      await api.updaterDownloadAndInstall();
    } catch (e) {
      console.error("Failed to download update:", e);
    }
  };

  const handleRestartUpdate = async () => {
    try {
      await api.updaterRestart();
    } catch (e) {
      console.error("Failed to restart for update:", e);
    }
  };

  const hasUpdate = updateStatus.status === "available" || updateStatus.status === "downloaded";

  return (
    <div className="app">
      <TopBar
        tab={tab}
        setTab={setTab}
        active={status.visible}
        waiting={overlay.enabled && !status.visible}
        onForceShow={() => saveSettings({ targetMode: "topmost" })}
        hasUpdate={hasUpdate}
      />
      <main>
        {tab === "vault" && (
          <Vault
            vault={vault}
            setVault={setVault}
            filter={filter}
            setFilter={setFilter}
            activeId={overlay.itemId}
            onLoad={loadItem}
            onSendToStack={sendToStack}
            onLoadPreset={(p) => loadPreset(p, true, true)}
            onUpload={recordUpload}
          />
        )}
        {tab === "display" && (
          <Display
            vault={vault}
            setVault={setVault}
            item={activeItem}
            overlay={overlay}
            setOverlay={setOverlay}
            monitors={monitors}
            status={status}
            goVault={() => setTab("vault")}
            compositeLive={live}
            stopComposite={() => setLive(false)}
            settings={settings}
            saveSettings={saveSettings}
          />
        )}
        {tab === "layering" && (
          <Layering
            vault={vault}
            setVault={setVault}
            layers={layers}
            setLayers={setLayers}
            addLayer={addLayer}
            live={live}
            setLive={setLive}
            push={pushComposite}
            monitors={monitors}
            monitor={overlay.monitor}
            setMonitor={(i) => setOverlay((o) => ({ ...o, monitor: i }))}
            settings={settings}
            activePresetId={activePresetId}
            setActivePresetId={setActivePresetId}
            loadPreset={(p, push) => loadPreset(p, push)}
            canvasRes={canvasRes}
            setCanvasRes={setCanvasRes}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            settings={settings}
            save={saveSettings}
            currentForegroundExe={currentForegroundExe}
            vault={vault}
            usageStats={usageStats}
            activeOverlayItemId={overlay.itemId}
            updateStatus={updateStatus}
            onCheckUpdate={handleCheckUpdate}
            onDownloadUpdate={handleDownloadUpdate}
            onRestartUpdate={handleRestartUpdate}
          />
        )}
      </main>

      {toast && (
        <div className="toast-banner">
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-sub">{toast.sub}</div>
          </div>
          {toast.actionLabel && toast.onAction && (
            <button
              className="btn primary small"
              onClick={() => {
                toast.onAction!();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button className="btn outline small num-btn" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
