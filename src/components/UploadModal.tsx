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
      setName((n) => n || f.name.replace(/\.[^.]+$/, ""));
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
            <span className="mono tag">{info.width}x{info.height} · {resolutionTag(info.width, info.height)}</span>
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

      <label className="label">Overlay name</label>
      <input className="input full" value={name} placeholder="Defaults to filename" onChange={(e) => setName(e.target.value)} />

      <label className="label">Game category <span className="req">required</span></label>
      <div className="pill-bar wrap">
        {GAMES.map((g) => (
          <button key={g} type="button" className={`pill${game === g ? " active" : ""}`} onClick={() => setGame(g)}>
            {g}
          </button>
        ))}
      </div>

      <label className="label">Element type <span className="muted small">optional · used by Layering drawer</span></label>
      <div className="pill-bar wrap">
        {ELEMENT_TAGS.map((t) => (
          <button key={t.id} type="button" className={`pill${tag === t.id ? " active" : ""}`} onClick={() => setTag(tag === t.id ? "" : t.id)}>
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