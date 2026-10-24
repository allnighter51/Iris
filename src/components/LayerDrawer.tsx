import { useMemo, useState } from "react";
import { assetUrl } from "../api";
import { ELEMENT_TAGS, type VaultData, type VaultItem } from "../types";
import { gameClass, resolutionTag } from "../util";

const GAME_OPTIONS = ["All", "Overwatch", "Valorant", "Marvel Rivals", "Apex Legends", "Fortnite", "Dead by Daylight", "Other"];

/** Left panel: compact Vault browser that appends elements to the stack. */
export function LayerDrawer({ vault, onAdd }: { vault: VaultData; onAdd: (item: VaultItem) => void }) {
  const [q, setQ] = useState("");
  const [game, setGame] = useState("All");
  const [tag, setTag] = useState("all");

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vault.items
      .filter((i) => (game === "All" || i.game === game) && (tag === "all" || i.tag === tag) && (!s || i.name.toLowerCase().includes(s)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [vault.items, q, game, tag]);

  return (
    <aside className="drawer card bracket">
      <div className="panel-title">
        <span>Vault Drawer</span>
        <span className="mono muted small">{items.length}</span>
      </div>
      <input className="input full" placeholder="Search elements..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="drawer-filters">
        <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
          {GAME_OPTIONS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All elements</option>
          {ELEMENT_TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="drawer-grid">
        {items.map((item) => (
          <div
            key={item.id}
            className="mini"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-iris-item", item.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => onAdd(item)}
            title="Drag onto the canvas, or double-click to add"
          >
            <div className="checker mini-thumb">
              <img draggable={false} loading="lazy" src={assetUrl(item.thumb ? vault.thumbsDir : vault.assetsDir, item.thumb ?? item.file)} alt="" />
              <span className="mono mini-res">{resolutionTag(item.width, item.height)}</span>
            </div>
            <div className="mini-name">{item.name}</div>
            <div className="mini-row">
              <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
              {item.tag && <span className="chip folder">{ELEMENT_TAGS.find((t) => t.id === item.tag)?.label ?? item.tag}</span>}
            </div>
            <button className="btn small outline add" onClick={() => onAdd(item)}>+ Add as Layer</button>
          </div>
        ))}
        {!items.length && <div className="muted small empty-note">No matching elements. Upload PNGs in the Vault and tag them (Ult Icon, Minimap…).</div>}
      </div>
    </aside>
  );
}
