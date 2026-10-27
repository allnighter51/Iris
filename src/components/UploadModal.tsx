import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ELEMENT_TAGS, GAMES, type VaultData } from "../types";
import { analyzeImage, makeThumbnail, resolutionTag } from "../util";
import { Modal } from "./ui";

interface Analysis { bmp: ImageBitmap; width: number; height: number; hasAlpha: boolean; }

const GAME_RULES = [
  { game: "Valorant", re: /\b(valorant|val|jett|reyna|clove|omen|sage|phoenix|sova|viper|cypher|brimstone|breach|raze|killjoy|skye|yoru|astra|kayo|chamber|neon|fade|harbor|gekko|deadlock|iso|vyse)\b/i, strip: /^(valorant|val)[\s_-]+/i },
  { game: "Overwatch", re: /\b(overwatch|ow2?|dokiwatch|kiriko|mercy|genji|d\.?va|ana|tracer|widowmaker|reinhardt|zenyatta|hanzo|reaper|cassidy|ashe|soldier|lucio|moira|sigma|sojourn|ramattra|illari|mauga|venture|juno)\b/i, strip: /^(overwatch|ow2?)[\s_-]+/i },
  { game: "Call of Duty", re: /\b(call\s*of\s*duty|warzone|cod|mw[123]?|bo6|black\s*ops)\b/i, strip: /^(call[\s_-]*of[\s_-]*duty|warzone|cod|mw[123]?|bo6|black[\s_-]*ops)[\s_-]+/i },
  { game: "Fortnite", re: /\b(fortnite|fn)\b/i, strip: /^(fortnite|fn)[\s_-]+/i },
  { game: "Dead by Daylight", re: /\b(dead\s*by\s*daylight|dbd)\b/i, strip: /^(dead[\s_-]*by[\s_-]*daylight|dbd)[\s_-]+/i },
  { game: "Apex Legends", re: /\b(apex\s*legends|apex)\b/i, strip: /^(apex[\s_-]*legends|apex)[\s_-]+/i },
  { game: "Marvel Rivals", re: /\b(marvel\s*rivals|rivals|marvel)\b/i, strip: /^(marvel[\s_-]*rivals|rivals|marvel)[\s_-]+/i },
];

const TAG_RULES = [
  { id: "ult", re: /\b(ult|ultimate|icon|ability)\b/i },
  { id: "map", re: /\b(minimap|map|radar)\b/i },
  { id: "health", re: /\b(health|hp|healthbar|shield|status)\b/i },
  { id: "hud", re: /\b(hud|full|overlay|frame|pack)\b/i },
  { id: "reticle", re: /\b(reticle|crosshair|xhair|sight|dot)\b/i },
];

const ACRONYMS = new Set(["hud", "hp", "ow", "ow2", "cod", "mw", "bo6", "dbd", "fn", "ui", "fps", "4k", "2k", "hd"]);

function parseFilenameSmart(rawFilename: string) {
  const normalized = rawFilename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  let detectedGame: string | null = null;
  let cleaned = normalized;
  for (const r of GAME_RULES) {
    if (r.re.test(normalized)) {
      detectedGame = r.game;
      const stripped = cleaned.replace(r.strip, "").trim();
      if (stripped.length >= 2) cleaned = stripped;
      break;
    }
  }
  const detectedTag = TAG_RULES.find((r) => r.re.test(normalized))?.id ?? null;
  const cleanName = cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ") || "Untitled Overlay";
  return { cleanName, detectedGame, detectedTag };
}

function detectTagFromDimensions(w: number, h: number): string | null {
  if (!w || !h) return null;
  const r = w / h;
  if ((Math.abs(r - 16 / 9) < 0.04 || Math.abs(r - 21 / 9) < 0.08) && w >= 1280) return "hud";
  if (Math.abs(r - 1) <= 0.15 && w <= 256 && h <= 256) return "reticle";
  if (Math.abs(r - 1) <= 0.15 && w > 256 && w <= 600) return "ult";
  if (r >= 2.5 && h <= 350) return "health";
  return null;
}

function formatAspectRatio(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  if (Math.abs(r - 16 / 9) < 0.04) return "16:9";
  if (Math.abs(r - 21 / 9) < 0.08) return "21:9";
  if (Math.abs(r - 16 / 10) < 0.04) return "16:10";
  if (Math.abs(r - 4 / 3) < 0.04) return "4:3";
  if (Math.abs(r - 1) < 0.05) return "1:1";
  return `${r.toFixed(2)}:1`;
}

function inferBestFolder(vault: VaultData, targetGame: string): string {
  if (!targetGame || !vault.folders.length) return "";
  const counts: Record<string, number> = {};
  let best = "", max = 0;
  for (const item of vault.items) {
    if (item.game === targetGame && item.folder && vault.folders.includes(item.folder)) {
      counts[item.folder] = (counts[item.folder] || 0) + 1;
      if (counts[item.folder] > max) { max = counts[item.folder]; best = item.folder; }
    }
  }
  return best;
}

export function UploadModal({ vault, defaultGame, defaultFolder, onClose, onSaved }: {
  vault: VaultData; defaultGame: string; defaultFolder: string; onClose: () => void; onSaved: (v: VaultData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState<Analysis | null>(null);
  const [name, setName] = useState("");
  const [game, setGame] = useState(defaultGame);
  const [folder, setFolder] = useState(defaultFolder);
  const [tag, setTag] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const userClickedGameRef = useRef(Boolean(defaultGame));
  const userClickedTagRef = useRef(false);
  const userEditedNameRef = useRef(false);
  const [autoDetectedGame, setAutoDetectedGame] = useState(false);
  const [autoDetectedTag, setAutoDetectedTag] = useState(false);
  const [autoDetectedName, setAutoDetectedName] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(f?: File) {
    if (!f) return;
    setErr("");
    if (!/\.(png|webp)$/i.test(f.name) && f.type !== "image/png" && f.type !== "image/webp") {
      return setErr("Only .png and .webp files are supported.");
    }

    const parsed = parseFilenameSmart(f.name);
    if (!userEditedNameRef.current || !name.trim()) { setName(parsed.cleanName); setAutoDetectedName(true); }

    let resolvedGame = game;
    if (!userClickedGameRef.current && parsed.detectedGame) {
      resolvedGame = parsed.detectedGame;
      setGame(parsed.detectedGame);
      setAutoDetectedGame(true);
    }

    let filenameTagMatched = false;
    if (!userClickedTagRef.current && parsed.detectedTag) {
      setTag(parsed.detectedTag);
      setAutoDetectedTag(true);
      filenameTagMatched = true;
    }

    if (!defaultFolder && !folder && resolvedGame) {
      const smartFolder = inferBestFolder(vault, resolvedGame);
      if (smartFolder) setFolder(smartFolder);
    }

    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));

    try {
      if (info?.bmp) info.bmp.close();
      const analysis = await analyzeImage(f);
      setInfo(analysis);
      if (!userClickedTagRef.current && !filenameTagMatched) {
        const dimTag = detectTagFromDimensions(analysis.width, analysis.height);
        if (dimTag) { setTag(dimTag); setAutoDetectedTag(true); }
      }
    } catch {
      setErr("Could not decode image.");
    }
  }

  const canSave = file && info && name.trim() && game && !busy;

  async function save() {
    if (!file || !info || !canSave) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const item = await api.importAsset(bytes, { name, game, folder, tag, width: info.width, height: info.height });
      if (favorite) await api.updateItem(item.id, { favorite: true });
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
            <span className="mono tag">{info.width}×{info.height} • {formatAspectRatio(info.width, info.height)}</span>
            {info.height >= 1080 && <span className="mono tag">{resolutionTag(info.width, info.height)}</span>}
            <span className={`mono tag ${info.hasAlpha ? "ok" : "warn"}`}>{info.hasAlpha ? "Alpha OK" : "No Alpha"}</span>
            <div className="spacer" />
            <button type="button" className="btn small outline" onClick={() => input.current?.click()}>Change File</button>
          </div>
        </div>
      ) : (
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
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
        onChange={(e) => { userEditedNameRef.current = true; setAutoDetectedName(false); setName(e.target.value); }}
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
            onClick={() => { userClickedGameRef.current = true; setAutoDetectedGame(false); setGame(g); }}
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
            onClick={() => { userClickedTagRef.current = true; setAutoDetectedTag(false); setTag(tag === t.id ? "" : t.id); }}
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
        <button className="btn primary" disabled={!canSave} onClick={save}>{busy ? "Saving..." : "Save to Vault"}</button>
      </div>
    </Modal>
  );
}
