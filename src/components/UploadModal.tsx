import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ELEMENT_TAGS, GAMES, type VaultData } from "../types";
import { analyzeImage, makeThumbnail, resolutionTag } from "../util";
import { Modal } from "./ui";

interface Analysis {
  bmp: ImageBitmap;
  width: number;
  height: number;
  hasAlpha: boolean;
}

interface GameRule {
  game: string;
  aliases: RegExp[];
  heroes: RegExp[];
  stripPrefixes: RegExp[];
}

const GAME_RULES: GameRule[] = [
  {
    game: "Valorant",
    aliases: [/\b(valorant|val)\b/i],
    heroes: [
      /\b(jett|reyna|clove|omen|sage|phoenix|sova|viper|cypher|brimstone|breach|raze|killjoy|skye|yoru|astra|kayo|kay\/o|chamber|neon|fade|harbor|gekko|deadlock|iso|vyse)\b/i,
    ],
    stripPrefixes: [/^(valorant|val)[\s_-]+/i],
  },
  {
    game: "Overwatch",
    aliases: [/\b(overwatch|ow|ow2)\b/i],
    heroes: [
      /\b(kiriko|mercy|genji|dva|d\.va|ana|tracer|widowmaker|reinhardt|zenyatta|hanzo|reaper|cassidy|ashe|soldier|lucio|moira|sigma|sojourn|ramattra|illari|mauga|venture|juno)\b/i,
    ],
    stripPrefixes: [/^(overwatch|ow2|ow)[\s_-]+/i],
  },
  {
    game: "Call of Duty",
    aliases: [/\b(call\s*of\s*duty|warzone|cod|mw|mw2|mw3|bo6|black\s*ops)\b/i],
    heroes: [],
    stripPrefixes: [/^(call[\s_-]*of[\s_-]*duty|warzone|cod|mw[123]?|bo6|black[\s_-]*ops)[\s_-]+/i],
  },
  {
    game: "Fortnite",
    aliases: [/\b(fortnite|fn)\b/i],
    heroes: [],
    stripPrefixes: [/^(fortnite|fn)[\s_-]+/i],
  },
  {
    game: "Dead by Daylight",
    aliases: [/\b(dead\s*by\s*daylight|dbd)\b/i],
    heroes: [],
    stripPrefixes: [/^(dead[\s_-]*by[\s_-]*daylight|dbd)[\s_-]+/i],
  },
  {
    game: "Apex Legends",
    aliases: [/\b(apex\s*legends|apex)\b/i],
    heroes: [],
    stripPrefixes: [/^(apex[\s_-]*legends|apex)[\s_-]+/i],
  },
  {
    game: "Marvel Rivals",
    aliases: [/\b(marvel\s*rivals|rivals|marvel)\b/i],
    heroes: [],
    stripPrefixes: [/^(marvel[\s_-]*rivals|rivals|marvel)[\s_-]+/i],
  },
];

const TAG_RULES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "reticle", patterns: [/\b(reticle|crosshair|xhair|sight|dot)\b/i] },
  { id: "map", patterns: [/\b(minimap|map|radar)\b/i] },
  { id: "health", patterns: [/\b(healthbar|health|hp|shield|status)\b/i] },
  { id: "ult", patterns: [/\b(ultimate|ult|ability|icon)\b/i] },
  { id: "hud", patterns: [/\b(hud|overlay|full|frame|pack)\b/i] },
];

export function detectGameFromFilename(name: string): string | null {
  const norm = name.replace(/[-_.]+/g, " ");
  // Pass 1: explicit game aliases/titles
  for (const rule of GAME_RULES) {
    for (const re of rule.aliases) {
      if (re.test(norm) || re.test(name)) {
        return rule.game;
      }
    }
  }
  // Pass 2: hero / agent keywords
  for (const rule of GAME_RULES) {
    for (const re of rule.heroes) {
      if (re.test(norm) || re.test(name)) {
        return rule.game;
      }
    }
  }
  return null;
}

export function detectTagFromFilename(name: string): string | null {
  const norm = name.replace(/[-_.]+/g, " ");
  for (const rule of TAG_RULES) {
    for (const re of rule.patterns) {
      if (re.test(norm) || re.test(name)) {
        return rule.id;
      }
    }
  }
  return null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatAspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "—";
  if (w === h) return "1:1";

  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.02) return "16:9";
  if (
    Math.abs(ratio - 21 / 9) < 0.05 ||
    Math.abs(ratio - 43 / 18) < 0.05 ||
    (w === 3440 && h === 1440) ||
    (w === 2560 && h === 1080)
  ) {
    return "21:9";
  }
  if (Math.abs(ratio - 32 / 9) < 0.05 || (w === 5120 && h === 1440)) return "32:9";
  if (Math.abs(ratio - 16 / 10) < 0.02) return "16:10";
  if (Math.abs(ratio - 4 / 3) < 0.02) return "4:3";
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16";

  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 32 && rh <= 32) {
    return `${rw}:${rh}`;
  }
  return `${ratio.toFixed(2)}:1`;
}

export function detectTagFromDimensions(w: number, h: number): string | null {
  if (w <= 0 || h <= 0) return null;

  const ratio = w / h;
  const is16by9 = Math.abs(ratio - 16 / 9) < 0.04;
  const is21by9 =
    Math.abs(ratio - 21 / 9) < 0.06 ||
    Math.abs(ratio - 43 / 18) < 0.06 ||
    (w === 3440 && h === 1440) ||
    (w === 2560 && h === 1080);

  // Full HUD: standard 16:9 or 21:9 monitor aspect ratios and >= 1280px wide
  if (w >= 1280 && (is16by9 || is21by9)) {
    return "hud";
  }

  // Health Bar: wide horizontal aspect ratio (width >= 2.5x height) and height <= 300px
  if (w >= 2.5 * h && h <= 300) {
    return "health";
  }

  // Square (1:1) aspect ratio heuristics:
  const isSquare = Math.abs(w - h) <= Math.max(2, Math.round(w * 0.02));
  if (isSquare) {
    const maxDim = Math.max(w, h);
    if (maxDim <= 96) return "reticle";
    if (maxDim >= 97 && maxDim <= 256) return "ult";
    if (maxDim >= 257 && maxDim <= 600) return "map";
  }

  return null;
}

export function cleanOverlayName(rawName: string, detectedGame?: string | null): string {
  let cleaned = rawName.replace(/\.[^.]+$/, "");

  if (detectedGame) {
    const rule = GAME_RULES.find((r) => r.game === detectedGame);
    if (rule) {
      for (const prefixRe of rule.stripPrefixes) {
        if (prefixRe.test(cleaned)) {
          const stripped = cleaned.replace(prefixRe, "").trim();
          if (stripped.length > 0) {
            cleaned = stripped;
            break;
          }
        }
      }
    }
  } else {
    for (const rule of GAME_RULES) {
      for (const prefixRe of rule.stripPrefixes) {
        if (prefixRe.test(cleaned)) {
          const stripped = cleaned.replace(prefixRe, "").trim();
          if (stripped.length > 0) {
            cleaned = stripped;
            break;
          }
        }
      }
    }
  }

  cleaned = cleaned.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    cleaned = rawName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  const acronyms = new Set(["HUD", "HP", "UI", "FPS", "COD", "DBD", "OW", "FN", "MW"]);
  const words = cleaned.split(/\s+/).map((w) => {
    const up = w.toUpperCase();
    if (acronyms.has(up)) return up;
    if (up === "DVA") return "D.Va";
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });

  return words.join(" ");
}

export function UploadModal({
  vault,
  defaultGame,
  defaultFolder,
  onClose,
  onSaved,
}: {
  vault: VaultData;
  defaultGame: string;
  defaultFolder: string;
  onClose: () => void;
  onSaved: (v: VaultData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [info, setInfo] = useState<Analysis | null>(null);
  const [name, setName] = useState("");
  const [game, setGame] = useState(defaultGame);
  const [folder, setFolder] = useState(defaultFolder);
  const [tag, setTag] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  // Auto-detection indicators
  const [autoDetectedName, setAutoDetectedName] = useState(false);
  const [autoDetectedGame, setAutoDetectedGame] = useState(false);
  const [autoDetectedTag, setAutoDetectedTag] = useState(false);

  // Session interaction tracking
  const userEditedNameRef = useRef(false);
  const userClickedGameRef = useRef(false);
  const userClickedTagRef = useRef(false);

  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr("");
    setInfo(null);
    if (!/\.(png|webp)$/i.test(f.name) && !/^image\/(png|webp)$/.test(f.type)) {
      setErr("Only .png and .webp files are accepted.");
      return;
    }
    try {
      const a = await analyzeImage(f);
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setInfo(a);

      const rawName = f.name.replace(/\.[^.]+$/, "");
      const detectedGame = detectGameFromFilename(rawName);
      const tagFromFilename = detectTagFromFilename(rawName);
      const tagFromDims = !tagFromFilename ? detectTagFromDimensions(a.width, a.height) : null;
      const detectedTag = tagFromFilename || tagFromDims;

      if (!userEditedNameRef.current) {
        setName(cleanOverlayName(rawName, detectedGame));
        setAutoDetectedName(true);
      }

      if (!userClickedGameRef.current && detectedGame) {
        setGame(detectedGame);
        setAutoDetectedGame(true);
      }

      if (!userClickedTagRef.current && detectedTag) {
        setTag(detectedTag);
        setAutoDetectedTag(true);
      }

      if (!a.hasAlpha) {
        setErr("Warning: No transparency detected. This image has no alpha channel and may cover the screen.");
      }
    } catch {
      setErr("Could not decode this image.");
    }
  }

  const canSave = !!file && !!game && !!name.trim() && !busy;

  async function save() {
    if (!file || !info) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const item = await api.importAsset(bytes, { name, game, folder, tag, width: info.width, height: info.height });
      if (favorite) {
        await api.updateItem(item.id, { favorite: true });
      }
      onSaved(await api.saveThumbnail(item.id, await makeThumbnail(info.bmp)));
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Upload New Design" onClose={onClose} width={620}>
      <input ref={input} type="file" accept=".png,.webp,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />

      {preview && info ? (
        <div className="upload-preview-card card bracket checker">
          <div className="upload-preview-screen">
            <img src={preview} alt="Overlay Preview" className="upload-preview-img" />
          </div>
          <div className="upload-preview-overlay-bar">
            <span className="mono tag">
              {info.width}×{info.height} • {formatAspectRatio(info.width, info.height)}
            </span>
            {info.height >= 1080 && (
              <span className="mono tag">{resolutionTag(info.width, info.height)}</span>
            )}
            <span className={`mono tag ${info.hasAlpha ? "ok" : "warn"}`}>
              {info.hasAlpha ? "Alpha OK" : "No Alpha"}
            </span>
            <div className="spacer" />
            <button type="button" className="btn small outline" onClick={() => input.current?.click()}>
              Change File
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <div className="dz-icon">^</div>
          <div>Drag &amp; drop a transparent <b>.png</b> or <b>.webp</b></div>
          <div className="muted small">or click to browse from your computer</div>
        </div>
      )}

      <label className="label">
        Overlay name
        {autoDetectedName && <span className="auto-detect-badge">✦ Auto-detected</span>}
      </label>
      <input
        className="input full"
        value={name}
        placeholder="Defaults to filename"
        onChange={(e) => {
          userEditedNameRef.current = true;
          setAutoDetectedName(false);
          setName(e.target.value);
        }}
      />

      <label className="label">
        Game category <span className="req">required</span>
        {autoDetectedGame && <span className="auto-detect-badge">✦ Auto-detected</span>}
      </label>
      <div className="pill-bar wrap">
        {GAMES.map((g) => (
          <button
            key={g}
            type="button"
            className={`pill${game === g ? " active" : ""}${autoDetectedGame && game === g ? " auto-detected" : ""}`}
            onClick={() => {
              userClickedGameRef.current = true;
              setAutoDetectedGame(false);
              setGame(g);
            }}
          >
            {g}
          </button>
        ))}
      </div>

      <label className="label">
        Element type <span className="muted small">optional · used by Layering drawer</span>
        {autoDetectedTag && <span className="auto-detect-badge">✦ Auto-detected</span>}
      </label>
      <div className="pill-bar wrap">
        {ELEMENT_TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pill${tag === t.id ? " active" : ""}${autoDetectedTag && tag === t.id ? " auto-detected" : ""}`}
            onClick={() => {
              userClickedTagRef.current = true;
              setAutoDetectedTag(false);
              setTag(tag === t.id ? "" : t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="label">Custom folder <span className="muted small">optional</span></label>
      <select className="input full" value={folder} onChange={(e) => setFolder(e.target.value)}>
        <option value="">— None —</option>
        {vault.folders.map((f) => <option key={f}>{f}</option>)}
      </select>

      <label className="check">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
        <span>Add to Favorites *</span>
      </label>

      {err && <div className="error">{err}</div>}
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {busy ? "Saving..." : "Save to Vault"}
        </button>
      </div>
    </Modal>
  );
}
