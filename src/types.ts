export const GAMES = [
  "Valorant",
  "Overwatch",
  "Call of Duty",
  "Fortnite",
  "Dead by Daylight",
  "Apex Legends",
  "Marvel Rivals",
  "Other",
] as const;

/** Order of the game pills in the Vault filter bar. */
export const FILTER_GAMES = [
  "Overwatch",
  "Valorant",
  "Call of Duty",
  "Fortnite",
  "Dead by Daylight",
  "Apex Legends",
  "Marvel Rivals",
  "Other",
] as const;

export type Tab = "display" | "layering" | "vault" | "settings";

export interface Transform {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  hue: number;
  brightness: number;
  contrast: number;
  chromaCycle?: boolean;
  chromaSpeed?: number;
}

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 100,
  opacity: 100,
  hue: 0,
  brightness: 100,
  contrast: 100,
  chromaCycle: false,
  chromaSpeed: 6,
};

export interface VaultItem {
  id: string;
  name: string;
  game: string;
  folder: string | null;
  file: string;
  thumb: string | null;
  width: number;
  height: number;
  createdAt: number;
  transform: Transform | null;
  tag?: string | null;
  favorite?: boolean;
}

export type Role = "base" | "ult" | "map" | "ability" | "crosshair" | "custom";

export const ROLES: { id: Role; label: string; badge: string }[] = [
  { id: "base", label: "Base HUD", badge: "BASE" },
  { id: "ult", label: "Ult Icon", badge: "ULT" },
  { id: "map", label: "Map Overlay", badge: "MAP" },
  { id: "ability", label: "Ability Bar", badge: "ABILITY" },
  { id: "crosshair", label: "Crosshair", badge: "RETICLE" },
  { id: "custom", label: "Custom", badge: "CUSTOM" },
];

export const ELEMENT_TAGS = [
  { id: "ult", label: "Ult Icon" },
  { id: "map", label: "Minimap" },
  { id: "health", label: "Health Bar" },
  { id: "hud", label: "Full HUD" },
  { id: "reticle", label: "Reticle" },
] as const;

/** One modular element in a composite stack (also the persisted preset layer). */
export interface Layer {
  id: string;
  vaultItemId: string;
  name: string;
  role: Role;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  hue: number;
  /** non-destructive crop / flip / blend / link group (optional for old presets) */
  fx?: LayerFx;
}

/** Crop values are % of the source image trimmed from each edge. */
export interface LayerFx {
  cropT: number;
  cropR: number;
  cropB: number;
  cropL: number;
  flipX: boolean;
  flipY: boolean;
  blend: string;
  group: string | null;
}

export const DEFAULT_FX: LayerFx = {
  cropT: 0,
  cropR: 0,
  cropB: 0,
  cropL: 0,
  flipX: false,
  flipY: false,
  blend: "normal",
  group: null,
};

export const fxOf = (l: { fx?: LayerFx }): LayerFx => ({ ...DEFAULT_FX, ...(l.fx ?? {}) });

export const BLEND_MODES = [
  { id: "normal", label: "Normal" },
  { id: "screen", label: "Screen (drops black)" },
  { id: "color-dodge", label: "Color Dodge (neon glow)" },
  { id: "overlay", label: "Overlay" },
  { id: "soft-light", label: "Soft Light" },
  { id: "lighten", label: "Lighten" },
  { id: "multiply", label: "Multiply" },
] as const;

export const LINK_GROUPS = ["A", "B", "C", "D"] as const;

export interface CanvasRes {
  w: number;
  h: number;
}

export const RES_GROUPS: { label: string; items: { label: string; w: number; h: number }[] }[] = [
  {
    label: "16:9",
    items: [
      { label: "720p HD", w: 1280, h: 720 },
      { label: "900p", w: 1600, h: 900 },
      { label: "1080p FHD", w: 1920, h: 1080 },
      { label: "1440p QHD (2K)", w: 2560, h: 1440 },
      { label: "2160p UHD (4K)", w: 3840, h: 2160 },
    ],
  },
  {
    label: "21:9 Ultrawide",
    items: [
      { label: "UW 720p", w: 1720, h: 720 },
      { label: "UW-FHD", w: 2560, h: 1080 },
      { label: "UW-QHD (2K)", w: 3440, h: 1440 },
      { label: "UW 4K-lite", w: 3840, h: 1600 },
    ],
  },
  {
    label: "16:10 / 4:3 / Stretched",
    items: [
      { label: "16:10 WUXGA", w: 1920, h: 1200 },
      { label: "16:10 WQXGA", w: 2560, h: 1600 },
      { label: "4:3 Stretched 1080", w: 1440, h: 1080 },
      { label: "4:3 Stretched 960", w: 1280, h: 960 },
    ],
  },
];

export const ALL_RES = RES_GROUPS.flatMap((g) => g.items);

export interface CompositePreset {
  id: string;
  name: string;
  game: string | null;
  layers: Layer[];
  refW: number;
  refH: number;
  inVault: boolean;
  createdAt: number;
}

export interface SceneLayer {
  path: string;
  width: number;
  height: number;
  transform: Transform;
  fx?: LayerFx;
}

export interface VaultData {
  items: VaultItem[];
  folders: string[];
  presets: CompositePreset[];
  rootDir: string;
  assetsDir: string;
  thumbsDir: string;
}

export interface Settings {
  hotkeyToggle: string;
  hotkeyNext: string;
  hotkeyPrev: string;
  hideFromCapture: boolean;
  targetMode: "topmost" | "game";
  targetExe: string;
  autoGameSwitch?: boolean;
  autoHideUnfocused?: boolean;
  gameProfiles?: Record<string, string>;
  startWithWindows: boolean;
  closeToTray: boolean;
  hardwareAcceleration: boolean;
  lowResource: boolean;
  layerHotkeys: Record<string, string>;
}

export interface OverlayState {
  enabled: boolean;
  itemId: string | null;
  path: string | null;
  width: number;
  height: number;
  transform: Transform;
  monitor: number;
  /** when non-empty the composite is drawn instead of `path` */
  scene: SceneLayer[];
}

export const DEFAULT_OVERLAY: OverlayState = {
  enabled: false,
  itemId: null,
  path: null,
  width: 0,
  height: 0,
  transform: DEFAULT_TRANSFORM,
  monitor: 0,
  scene: [],
};

export interface OverlayPayload {
  state: OverlayState;
  visible: boolean;
  monitorW: number;
  monitorH: number;
  lowRes: boolean;
}

export interface OverlayStatus {
  enabled: boolean;
  visible: boolean;
  gameRunning: boolean;
}

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  refreshHz: number;
}

export const GAME_EXES: { label: string; exe: string }[] = [
  { label: "Overwatch 2", exe: "Overwatch.exe" },
  { label: "Valorant", exe: "Valorant-Win64-Shipping.exe" },
  { label: "Call of Duty / Warzone", exe: "cod.exe" },
  { label: "Marvel Rivals", exe: "MarvelRivals.exe" },
  { label: "Fortnite", exe: "FortniteClient-Win64-Shipping.exe" },
  { label: "Apex Legends", exe: "r5apex.exe" },
  { label: "Dead by Daylight", exe: "DeadByDaylight-Win64-Shipping.exe" },
];

export interface KnownGame {
  name: string;
  label: string;
  exes: string[];
  color: string;
}

export const KNOWN_GAMES: KnownGame[] = [
  { name: "Overwatch", label: "Overwatch 2", exes: ["Overwatch.exe"], color: "#06B6D4" },
  { name: "Valorant", label: "Valorant", exes: ["Valorant-Win64-Shipping.exe", "VALORANT-Win64-Shipping.exe"], color: "#EF4444" },
  {
    name: "Call of Duty",
    label: "Call of Duty / Warzone",
    exes: ["cod.exe", "bootcamp.exe", "ModernWarfare.exe", "BlackOpsColdWar.exe", "Call of Duty.exe"],
    color: "#10B981",
  },
  { name: "Marvel Rivals", label: "Marvel Rivals", exes: ["MarvelRivals.exe", "Marvel-Rivals.exe"], color: "#8B5CF6" },
  { name: "Apex Legends", label: "Apex Legends", exes: ["r5apex.exe"], color: "#F59E0B" },
  { name: "Fortnite", label: "Fortnite", exes: ["FortniteClient-Win64-Shipping.exe"], color: "#3B82F6" },
  { name: "Dead by Daylight", label: "Dead by Daylight", exes: ["DeadByDaylight-Win64-Shipping.exe"], color: "#EC4899" },
];
