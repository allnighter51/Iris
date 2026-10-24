import { useEffect, useMemo, useState } from "react";
import { api, assetUrl } from "../api";
import { ELEMENT_TAGS, FILTER_GAMES, GAMES, type CompositePreset, type VaultData, type VaultItem } from "../types";
import { StackThumb } from "./SceneView";
import { filterItems, gameClass, resolutionTag, type SortKey } from "../util";
import { Modal } from "./ui";
import { UploadModal } from "./UploadModal";

type Dialog =
  | { kind: "upload" }
  | { kind: "folder" }
  | { kind: "rename"; item: VaultItem }
  | { kind: "move"; item: VaultItem }
  | { kind: "delete"; item: VaultItem }
  | { kind: "delPreset"; preset: CompositePreset }
  | null;

interface Menu {
  x: number;
  y: number;
  item?: VaultItem;
  preset?: CompositePreset;
}

interface Props {
  vault: VaultData;
  setVault: (v: VaultData) => void;
  filter: string;
  setFilter: (f: string) => void;
  activeId: string | null;
  onLoad: (item: VaultItem) => void;
  onSendToStack: (item: VaultItem) => void;
  onLoadPreset: (p: CompositePreset) => void;
}

export function Vault({ vault, setVault, filter, setFilter, activeId, onLoad, onSendToStack, onLoadPreset }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // STACK presets pinned to the Vault
  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vault.presets
      .filter((p) => p.inVault)
      .filter((p) => {
        if (filter === "Favorites") return false; // STACK presets aren't individually favorited
        if (filter === "All") return true;
        return p.game === filter;
      })
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [vault.presets, filter, query]);

  const items = useMemo(
    () => filterItems(vault.items, filter, query, sort),
    [vault.items, filter, query, sort],
  );
  const pills = ["All", "Favorites", ...FILTER_GAMES, ...vault.folders];

  // a deleted folder must not leave the filter dangling
  useEffect(() => {
    if (!pills.includes(filter)) setFilter("All");
  });

  const toggleFavorite = async (item: VaultItem) => {
    setVault(await api.updateItem(item.id, { favorite: !item.favorite }));
  };

  return (
    <div className="page vault" onClick={() => setSelected(null)}>
      <div className="vault-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn primary" onClick={() => setDialog({ kind: "upload" })}>
          + Upload New Design
        </button>
        <button className="btn outline" onClick={() => setDialog({ kind: "folder" })}>
          + New Folder
        </button>
        <div className="spacer" />
        <input
          className="input search"
          placeholder="Search overlays..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="new">Newest First</option>
          <option value="name">Name</option>
          <option value="game">Game</option>
        </select>
      </div>

      <div className="pill-bar" onClick={(e) => e.stopPropagation()}>
        {pills.map((p) => {
          const custom = vault.folders.includes(p);
          const isFav = p === "Favorites";
          return (
            <button
              key={p}
              className={`pill${filter === p ? " active" : ""}${custom ? " folder" : ""}${isFav ? " fav-pill" : ""}`}
              onClick={() => setFilter(p)}
            >
              {isFav ? (
                <span>&#x2605; Favorites</span>
              ) : (
                <>
                  {custom && <span className="folder-glyph">&#x25B8;</span>}
                  {p}
                  {custom && filter === p && (
                    <span
                      className="pill-x"
                      title="Delete folder (items are kept)"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setVault(await api.deleteFolder(p));
                        setFilter("All");
                      }}
                    >
                      &times;
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {items.length === 0 && presets.length === 0 ? (
        <div className="empty card bracket">
          <div className="empty-title">
            {filter === "Favorites"
              ? "No favorite overlays yet"
              : vault.items.length
                ? "No overlays match"
                : "Your Vault is empty"}
          </div>
          <p>
            {filter === "Favorites"
              ? "Click the star icon on any overlay card to add it to your Favorites."
              : vault.items.length
                ? "Try another folder or search term."
                : "Upload a transparent PNG to get started."}
          </p>
        </div>
      ) : (
        <div className="grid">
          {presets.map((p) => {
            const isSel = selected === p.id;
            return (
              <article
                key={p.id}
                className={`card bracket vcard stackcard${isSel ? " selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(p.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onLoadPreset(p);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(p.id);
                  setMenu({ x: e.clientX, y: e.clientY, preset: p });
                }}
              >
                <div className="thumb checker">
                  <StackThumb layers={p.layers} vault={vault} refW={p.refW} refH={p.refH} />
                  <div className="badges">
                    <span className="stack-badge mono">STACK</span>
                    {p.game && <span className={`tag mono ${gameClass(p.game)}`}>{p.game}</span>}
                  </div>
                  {isSel && (
                    <div className="quick" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onLoadPreset(p)}>Load Stack</button>
                      <button onClick={async () => setVault(await api.savePreset({ ...p, inVault: false }))}>Unpin</button>
                      <button className="danger" onClick={() => setDialog({ kind: "delPreset", preset: p })}>Delete</button>
                    </div>
                  )}
                </div>
                <div className="meta">
                  <h4>{p.name}</h4>
                  <div className="meta-row">
                    <span className="chip folder">{p.layers.length} layers</span>
                    <span className="dims mono">{p.refW}x{p.refH}</span>
                  </div>
                </div>
              </article>
            );
          })}
          {items.map((item) => {
            const isSel = selected === item.id;
            return (
              <article
                key={item.id}
                className={`card bracket vcard${isSel ? " selected" : ""}${activeId === item.id ? " live" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(item.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onLoad(item);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(item.id);
                  setMenu({ x: e.clientX, y: e.clientY, item });
                }}
              >
                <div className="thumb checker">
                  <img
                    loading="lazy"
                    draggable={false}
                    src={assetUrl(item.thumb ? vault.thumbsDir : vault.assetsDir, item.thumb ?? item.file)}
                    alt={item.name}
                  />
                  <button
                    type="button"
                    className={`fav-star-btn${item.favorite ? " active" : ""}`}
                    title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item);
                    }}
                  >
                    {item.favorite ? "\u2605" : "\u2606"}
                  </button>
                  <div className="badges">
                    <span className="tag mono">{resolutionTag(item.width, item.height)}</span>
                    <span className={`tag mono ${gameClass(item.game)}`}>{item.game}</span>
                  </div>
                  {activeId === item.id && <span className="live-dot mono">&#x25CF; ACTIVE</span>}
                  {isSel && (
                    <div className="quick" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleFavorite(item)}>
                        {item.favorite ? "Unfavorite" : "Favorite"}
                      </button>
                      <button onClick={() => setDialog({ kind: "rename", item })}>Rename</button>
                      <button onClick={() => setDialog({ kind: "move", item })}>Folder</button>
                      <button className="danger" onClick={() => setDialog({ kind: "delete", item })}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <div className="meta">
                  <h4>{item.name}</h4>
                  <div className="meta-row">
                    <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
                    {item.tag && <span className="chip folder">{ELEMENT_TAGS.find((t) => t.id === item.tag)?.label ?? item.tag}</span>}
                    {item.folder && <span className="chip folder">&#x25B8; {item.folder}</span>}
                    <span className="dims mono">
                      {item.width}x{item.height}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {menu && (
        <div className="ctxmenu card" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 220) }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {menu.item && (
            <>
              <button onClick={() => { onLoad(menu.item!); setMenu(null); }}>Load in Display</button>
              <button className="accent" onClick={() => { onSendToStack(menu.item!); setMenu(null); }}>Send to Layering Stack</button>
              <button onClick={async () => { await toggleFavorite(menu.item!); setMenu(null); }}>
                {menu.item!.favorite ? "\u2605 Remove from Favorites" : "\u2606 Add to Favorites"}
              </button>
              <hr />
              <button onClick={() => { setDialog({ kind: "rename", item: menu.item! }); setMenu(null); }}>Rename / Tag...</button>
              <button onClick={() => { setDialog({ kind: "move", item: menu.item! }); setMenu(null); }}>Change Folder...</button>
              <button className="danger" onClick={() => { setDialog({ kind: "delete", item: menu.item! }); setMenu(null); }}>Delete</button>
            </>
          )}
          {menu.preset && (
            <>
              <button className="accent" onClick={() => { onLoadPreset(menu.preset!); setMenu(null); }}>Load Stack (Layering + Live)</button>
              <button onClick={async () => { const p = menu.preset!; setMenu(null); setVault(await api.savePreset({ ...p, inVault: false })); }}>Unpin from Vault</button>
              <button className="danger" onClick={() => { setDialog({ kind: "delPreset", preset: menu.preset! }); setMenu(null); }}>Delete Preset</button>
            </>
          )}
        </div>
      )}

      {dialog?.kind === "delPreset" && (
        <Modal title="Delete preset" onClose={() => setDialog(null)} width={420}>
          <p className="muted">Delete the STACK preset <b>{dialog.preset.name}</b>? Your individual overlays are not affected.</p>
          <div className="modal-foot">
            <button className="btn outline" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn danger-solid" onClick={async () => { setVault(await api.deletePreset(dialog.preset.id)); setSelected(null); setDialog(null); }}>Delete</button>
          </div>
        </Modal>
      )}

      {dialog?.kind === "upload" && (
        <UploadModal
          vault={vault}
          defaultGame={(GAMES as readonly string[]).includes(filter) ? filter : ""}
          defaultFolder={vault.folders.includes(filter) ? filter : ""}
          onClose={() => setDialog(null)}
          onSaved={(v) => {
            setVault(v);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "folder" && (
        <FolderDialog vault={vault} onClose={() => setDialog(null)} onDone={(v, name) => { setVault(v); setFilter(name); setDialog(null); }} />
      )}
      {dialog?.kind === "rename" && (
        <RenameDialog item={dialog.item} onClose={() => setDialog(null)} onDone={(v) => { setVault(v); setDialog(null); }} />
      )}
      {dialog?.kind === "move" && (
        <MoveDialog vault={vault} item={dialog.item} onClose={() => setDialog(null)} onDone={(v) => { setVault(v); setDialog(null); }} />
      )}
      {dialog?.kind === "delete" && (
        <Modal title="Delete overlay" onClose={() => setDialog(null)} width={420}>
          <p className="muted">
            Permanently remove <b>{dialog.item.name}</b> and its saved calibration from the Vault?
          </p>
          <div className="modal-foot">
            <button className="btn outline" onClick={() => setDialog(null)}>Cancel</button>
            <button
              className="btn danger-solid"
              onClick={async () => {
                setVault(await api.deleteItem(dialog.item.id));
                setSelected(null);
                setDialog(null);
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FolderDialog({ vault, onClose, onDone }: { vault: VaultData; onClose: () => void; onDone: (v: VaultData, name: string) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    const n = name.trim();
    const reserved = ["all", "favorites", ...GAMES.map((g) => g.toLowerCase())];
    if (!n) return setErr("Enter a folder name.");
    if (reserved.includes(n.toLowerCase()) || vault.folders.some((f) => f.toLowerCase() === n.toLowerCase()))
      return setErr("That name is already used.");
    try {
      onDone(await api.createFolder(n), n);
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <Modal title="New Folder" onClose={onClose} width={420}>
      <label className="label">Folder name</label>
      <input className="input full" autoFocus value={name} placeholder="e.g. Ranked crosshairs" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      {err && <div className="error">{err}</div>}
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit}>Create Folder</button>
      </div>
    </Modal>
  );
}

function RenameDialog({ item, onClose, onDone }: { item: VaultItem; onClose: () => void; onDone: (v: VaultData) => void }) {
  const [name, setName] = useState(item.name);
  const [tag, setTag] = useState(item.tag ?? "");
  const [favorite, setFavorite] = useState(!!item.favorite);
  const submit = async () => name.trim() && onDone(await api.updateItem(item.id, { name, tag, favorite }));
  return (
    <Modal title="Rename / Tag overlay" onClose={onClose} width={440}>
      <input className="input full" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <label className="label">Element type</label>
      <div className="pill-bar wrap">
        {ELEMENT_TAGS.map((t) => (
          <button key={t.id} type="button" className={`pill${tag === t.id ? " active" : ""}`} onClick={() => setTag(tag === t.id ? "" : t.id)}>{t.label}</button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
        <span>Favorite overlay &#x2605;</span>
      </label>
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}

function MoveDialog({ vault, item, onClose, onDone }: { vault: VaultData; item: VaultItem; onClose: () => void; onDone: (v: VaultData) => void }) {
  const [folder, setFolder] = useState(item.folder ?? "");
  return (
    <Modal title="Change Folder" onClose={onClose} width={420}>
      <label className="label">Custom folder</label>
      <select className="input full" value={folder} onChange={(e) => setFolder(e.target.value)}>
        <option value="">— None —</option>
        {vault.folders.map((f) => <option key={f}>{f}</option>)}
      </select>
      <div className="modal-foot">
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => onDone(await api.updateItem(item.id, { folder }))}>Move</button>
      </div>
    </Modal>
  );
}