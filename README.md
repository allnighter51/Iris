# Iris — Lightweight In-Game HUD & Overlay Utility

Tauri 2 (Rust) + React/TypeScript. Windows only. Dark `veevisuals.art` theme (no glass).

## Run

```powershell
npm install
npm run tauri dev        # development
npm run tauri build      # NSIS installer (release: LTO, stripped, panic=abort)
```
Requires Rust, Node 18+, and the WebView2 runtime (ships with Windows 11).

## Structure

```
index.html / overlay.html      two Vite entry points (control UI / click-through overlay)
src/
  App.tsx                      state, tab routing, double-click → Display flow, hotkey cycling
  OverlayLayer.tsx             DOM renderer for the single-overlay Display preview
  overlay.tsx                  overlay window entry: composites everything onto ONE canvas
  layers.ts                    stack helpers (z-order, scene resolution, snapping)
  components/                  TopBar, Vault, UploadModal, Display, Settings, ui primitives,
                               Layering (+ LayerDrawer, LayerPanel, SceneView)
  api.ts types.ts util.ts styles.css
src-tauri/src/
  main.rs                      builder, window events, WebView2 flags
  win32.rs                     WS_EX_* styles, placement, WDA_EXCLUDEFROMCAPTURE, refresh rate, process lookup
  overlay.rs                   overlay window lifecycle + visibility/placement logic
  vault.rs                     manifest + asset commands (atomic JSON writes)
  system.rs                    global hotkeys, tray, autostart, monitors, game watcher, settings
  model.rs                     data model + persistence
```

## Overlay internals

The overlay is a second frameless, transparent, always-on-top window sized to the target
monitor's physical rectangle. [`win32::apply_overlay_styles`](src-tauri/src/win32.rs) sets
`WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`:
clicks fall through to the game, it never takes focus, and it is absent from Alt+Tab/taskbar.
It is shown with `SW_SHOWNOACTIVATE`. Scale 100% = native pixels (the canvas is monitor-sized in physical px,
CSS-scaled by `1/devicePixelRatio`).

**Rendering:** one OS window, one 2D canvas. A single PNG or a whole layer stack is drawn onto that canvas
only when state changes (images are decoded once and cached; the backbuffer is released while hidden).
Idle cost is one static surface, the same for 1 layer or 20. In-app previews use DOM instead.

## Layering

Tabs: Display / **Layering** / Vault / Settings. Add elements from the drawer (button, double-click, or drag onto
the canvas); drag/resize on the canvas (centre/edge snapping, Alt disables); reorder/hide/lock/duplicate in the
stack; tune role, X/Y, scale, opacity, hue per layer. **Push Composite to Live Overlay** then keeps the overlay in
live sync with the stack. **Save Layer Preset** stores a loadout (`presets` in `vault_manifest.json`);
"Pin to Vault" shows it as a **STACK** card whose double-click loads it live. Right-click Vault cards ->
*Send to Layering Stack*. Settings -> *Layer Role Hotkeys* toggle all layers of a role globally.
Reference backdrops for OW2/Valorant/Rivals are approximate schematics, not screenshots.
Use **borderless windowed** in-game (exclusive fullscreen hides all overlays).

## Data (`%APPDATA%\art.veevisuals.iris\`)

`vault_manifest.json`, `settings.json`, `vault_assets/`, `vault_thumbs/` (Settings → Open Vault Directory).
Per-item calibration (X, Y, scale, opacity, plus hue/brightness/contrast) is stored on the item via **Save Profile**.

## Notes

- Hotkeys: click a field in Settings, press the combo (Esc cancels, Del unbinds). Next/Previous cycle the overlays of the Vault's current filter.
- "Auto-Attach" polls the process list every 2 s (5 s in Low-Resource Mode) only while that mode is on.
- Hardware acceleration off passes `--disable-gpu` to WebView2 (restart required).
- "Desktop Capture" backdrop uses the system screen-share picker.
