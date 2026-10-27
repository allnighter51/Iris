import { useEffect, useMemo, useState } from "react";
import { api, assetUrl } from "../api";
import { ELEMENT_TAGS, FILTER_GAMES, GAMES, type CompositePreset, type VaultData, type VaultItem } from "../types";
import { StackThumb } from "./SceneView";
import { filterItems, gameClass, resolutionTag, type SortKey } from "../util";
import { Modal } from "./ui";
import { UploadModal } from "./UploadModal";

export type VaultViewMode = "grid" | "cards" | "carousel" | "list";

type Dialog =
  | { kind: "upload" }
  | { kind: "folder" }
  | { kind: "rename"; item: VaultItem }
  | { kind: "move"; item: VaultItem }
  | { kind: "delete"; item: VaultItem }
  | { kind: "delPreset"; preset: CompositePreset }
  | { kind: "manageGames" }
  | null;

interface Menu { x: number; y: number; item?: VaultItem; preset?: CompositePreset; }

interface Props {
  vault: VaultData;
  setVault: (v: VaultData) => void;
  filter: string;
  setFilter: (f: string) => void;
  activeId: string | null;
  onLoad: (item: VaultItem) => void;
  onSendToStack: (item: VaultItem) => void;
  onLoadPreset: (p: CompositePreset) => void;
  onUpload?: () => void;
}

const VIEW_MODES: { id: VaultViewMode; label: string; title: string }[] = [
  { id: "grid", label: "⊞ Grid", title: "Compact Grid View" },
  { id: "cards", label: "🗎 Cards", title: "Detailed Card View" },
  { id: "carousel", label: "❖ Carousel", title: "Cinematic Carousel View" },
  { id: "list", label: "☰ List", title: "Compact List View" },
];

const tagLabel = (tag?: string | null) => ELEMENT_TAGS.find((t) => t.id === tag)?.label ?? tag;

export function Vault({ vault, setVault, filter, setFilter, activeId, onLoad, onSendToStack, onLoadPreset, onUpload }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const [viewMode, setViewModeState] = useState<VaultViewMode>(() => {
    try {
      const s = localStorage.getItem("iris_vault_view_mode") as VaultViewMode;
      if (s && ["grid", "cards", "carousel", "list"].includes(s)) return s;
    } catch { /* ignore */ }
    return "grid";
  });

  const setViewMode = (mode: VaultViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem("iris_vault_view_mode", mode); } catch { /* ignore */ }
  };

  const [hiddenGames, setHiddenGamesState] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("iris_hidden_games") || "[]"); } catch { return []; }
  });

  const saveHiddenGames = (next: string[]) => {
    setHiddenGamesState(next);
    try { localStorage.setItem("iris_hidden_games", JSON.stringify(next)); } catch { /* ignore */ }
    if (next.includes(filter)) setFilter("All");
  };

  const hideGame = (game: string) => !hiddenGames.includes(game) && saveHiddenGames([...hiddenGames, game]);
  const toggleGameVisibility = (game: string) => saveHiddenGames(hiddenGames.includes(game) ? hiddenGames.filter((g) => g !== game) : [...hiddenGames, game]);

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

  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vault.presets
      .filter((p) => p.inVault && filter !== "Favorites" && (filter === "All" || p.game === filter) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [vault.presets, filter, query]);

  const items = useMemo(() => filterItems(vault.items, filter, query, sort), [vault.items, filter, query, sort]);
  const visibleGames = FILTER_GAMES.filter((g) => !hiddenGames.includes(g));
  const pills = ["All", "Favorites", ...visibleGames, ...vault.folders];

  useEffect(() => { if (!pills.includes(filter)) setFilter("All"); });

  const toggleFavorite = async (item: VaultItem) => setVault(await api.updateItem(item.id, { favorite: !item.favorite }));
  const thumbSrc = (item: VaultItem) => assetUrl(item.thumb ? vault.thumbsDir : vault.assetsDir, item.thumb ?? item.file);

  const openItemMenu = (e: React.MouseEvent, item: VaultItem) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(item.id); setMenu({ x: e.clientX, y: e.clientY, item });
  };
  const openPresetMenu = (e: React.MouseEvent, preset: CompositePreset) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(preset.id); setMenu({ x: e.clientX, y: e.clientY, preset });
  };

  const allEntries = useMemo(
    () => [...presets.map((data) => ({ type: "preset" as const, data })), ...items.map((data) => ({ type: "item" as const, data }))],
    [presets, items],
  );
  const safeCarouselIdx = Math.max(0, Math.min(carouselIdx, Math.max(0, allEntries.length - 1)));
  const activeEntry = allEntries[safeCarouselIdx] ?? null;

  useEffect(() => {
    if (viewMode !== "carousel" || allEntries.length <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setCarouselIdx((i) => (i <= 0 ? allEntries.length - 1 : i - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setCarouselIdx((i) => (i >= allEntries.length - 1 ? 0 : i + 1)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode, allEntries.length]);

  return (
    <div className="page vault" onClick={() => setSelected(null)}>
      <div className="vault-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn primary" onClick={() => setDialog({ kind: "upload" })}>+ Upload New Design</button>
        <button className="btn outline" onClick={() => setDialog({ kind: "folder" })}>+ New Folder</button>
        <div className="spacer" />

        <div className="seg vault-view-mode-seg" title="Vault View Mode">
          {VIEW_MODES.map((m) => (
            <button key={m.id} type="button" className={viewMode === m.id ? "active" : ""} onClick={() => setViewMode(m.id)} title={m.title}>{m.label}</button>
          ))}
        </div>

        <input className="input search" placeholder="Search overlays..." value={query} onChange={(e) => setQuery(e.target.value)} />
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
          const isGame = (FILTER_GAMES as readonly string[]).includes(p);
          return (
            <button key={p} className={`pill${filter === p ? " active" : ""}${custom ? " folder" : ""}${isFav ? " fav-pill" : ""}`} onClick={() => setFilter(p)}>
              {isFav ? (
                <span>&#x2605; Favorites</span>
              ) : (
                <>
                  {custom && <span className="folder-glyph">&#x25B8;</span>}
                  {p}
                  {custom && filter === p && (
                    <span className="pill-x" title="Delete folder (items are kept)" onClick={async (e) => { e.stopPropagation(); setVault(await api.deleteFolder(p)); setFilter("All"); }}>&times;</span>
                  )}
                  {isGame && (
                    <span className="pill-hide-btn" title={`Hide "${p}" tab`} onClick={(e) => { e.stopPropagation(); hideGame(p); }}>&times;</span>
                  )}
                </>
              )}
            </button>
          );
        })}

        <button type="button" className="pill manage-tabs-pill" onClick={() => setDialog({ kind: "manageGames" })} title="Customize visible game categories">
          ⚙ Manage Tabs{hiddenGames.length > 0 ? ` (${hiddenGames.length} hidden)` : ""}
        </button>
      </div>

      {items.length === 0 && presets.length === 0 ? (
        <div className="empty card bracket">
          <div className="empty-title">{filter === "Favorites" ? "No favorite overlays yet" : vault.items.length ? "No overlays match" : "Your Vault is empty"}</div>
          <p>{filter === "Favorites" ? "Click the star icon on any overlay card to add it to your Favorites." : vault.items.length ? "Try another folder or search term." : "Upload a transparent PNG to get started."}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid">
          {presets.map((p) => {
            const isSel = selected === p.id;
            return (
              <article
                key={p.id}
                className={`card bracket vcard stackcard${isSel ? " selected" : ""}`}
                onClick={(e) => { e.stopPropagation(); setSelected(p.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); onLoadPreset(p); }}
                onContextMenu={(e) => openPresetMenu(e, p)}
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
                onClick={(e) => { e.stopPropagation(); setSelected(item.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); onLoad(item); }}
                onContextMenu={(e) => openItemMenu(e, item)}
              >
                <div className="thumb checker">
                  <img loading="lazy" draggable={false} src={thumbSrc(item)} alt={item.name} />
                  <button
                    type="button"
                    className={`fav-star-btn${item.favorite ? " active" : ""}`}
                    title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
                  >
                    {item.favorite ? "★" : "☆"}
                  </button>
                  <div className="badges">
                    <span className="tag mono">{resolutionTag(item.width, item.height)}</span>
                    <span className={`tag mono ${gameClass(item.game)}`}>{item.game}</span>
                  </div>
                  {activeId === item.id && <span className="live-dot mono">● ACTIVE</span>}
                  {isSel && (
                    <div className="quick" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleFavorite(item)}>{item.favorite ? "Unfavorite" : "Favorite"}</button>
                      <button onClick={() => setDialog({ kind: "rename", item })}>Rename</button>
                      <button onClick={() => setDialog({ kind: "move", item })}>Folder</button>
                      <button className="danger" onClick={() => setDialog({ kind: "delete", item })}>Delete</button>
                    </div>
                  )}
                </div>
                <div className="meta">
                  <h4>{item.name}</h4>
                  <div className="meta-row">
                    <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
                    {item.tag && <span className="chip folder">{tagLabel(item.tag)}</span>}
                    {item.folder && <span className="chip folder">&#x25B8; {item.folder}</span>}
                    <span className="dims mono">{item.width}x{item.height}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : viewMode === "cards" ? (
        <div className="vault-cards">
          {presets.map((p) => (
            <article
              key={p.id}
              className={`card bracket vshowcase-card${selected === p.id ? " selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); setSelected(p.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onLoadPreset(p); }}
              onContextMenu={(e) => openPresetMenu(e, p)}
            >
              <div className="vshowcase-thumb checker">
                <StackThumb layers={p.layers} vault={vault} refW={p.refW} refH={p.refH} />
                <div className="badges">
                  <span className="stack-badge mono">STACK</span>
                  {p.game && <span className={`tag mono ${gameClass(p.game)}`}>{p.game}</span>}
                </div>
              </div>
              <div className="vshowcase-body">
                <div className="vshowcase-head"><h4>{p.name}</h4></div>
                <div className="vshowcase-chips">
                  <span className="chip folder">{p.layers.length} layers</span>
                  {p.game && <span className={`chip ${gameClass(p.game)}`}>{p.game}</span>}
                  <span className="dims mono">{p.refW} × {p.refH}</span>
                </div>
                <div className="vshowcase-actions">
                  <button className="btn small primary" onClick={() => onLoadPreset(p)}>Load Stack</button>
                  <button className="btn small outline" onClick={async () => setVault(await api.savePreset({ ...p, inVault: false }))}>Unpin</button>
                  <button className="btn small outline icon-btn" title="More options" onClick={(e) => openPresetMenu(e, p)}>⋯</button>
                </div>
              </div>
            </article>
          ))}
          {items.map((item) => (
            <article
              key={item.id}
              className={`card bracket vshowcase-card${selected === item.id ? " selected" : ""}${activeId === item.id ? " live" : ""}`}
              onClick={(e) => { e.stopPropagation(); setSelected(item.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onLoad(item); }}
              onContextMenu={(e) => openItemMenu(e, item)}
            >
              <div className="vshowcase-thumb checker">
                <img loading="lazy" draggable={false} src={thumbSrc(item)} alt={item.name} />
                <button
                  type="button"
                  className={`fav-star-btn${item.favorite ? " active" : ""}`}
                  title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
                >
                  {item.favorite ? "★" : "☆"}
                </button>
                <div className="badges">
                  <span className="tag mono">{resolutionTag(item.width, item.height)}</span>
                  <span className={`tag mono ${gameClass(item.game)}`}>{item.game}</span>
                </div>
                {activeId === item.id && <span className="live-dot mono">● ACTIVE</span>}
              </div>
              <div className="vshowcase-body">
                <div className="vshowcase-head"><h4>{item.name}</h4></div>
                <div className="vshowcase-chips">
                  <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
                  {item.tag && <span className="chip folder">{tagLabel(item.tag)}</span>}
                  {item.folder && <span className="chip folder">&#x25B8; {item.folder}</span>}
                  <span className="dims mono">{item.width} × {item.height}</span>
                </div>
                <div className="vshowcase-actions">
                  <button className="btn small primary" onClick={() => onLoad(item)}>Equip / Display</button>
                  <button className="btn small outline" onClick={() => onSendToStack(item)}>+ Add to Stack</button>
                  <button className="btn small outline icon-btn" title="More actions" onClick={(e) => openItemMenu(e, item)}>⋯</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : viewMode === "carousel" ? (
        <div className="vault-carousel">
          {activeEntry && (
            <div className="carousel-stage-card card bracket">
              <div className="carousel-preview checker">
                {allEntries.length > 1 && (
                  <>
                    <button type="button" className="carousel-nav-btn prev" aria-label="Previous item" onClick={() => setCarouselIdx((i) => (i <= 0 ? allEntries.length - 1 : i - 1))}>◀</button>
                    <button type="button" className="carousel-nav-btn next" aria-label="Next item" onClick={() => setCarouselIdx((i) => (i >= allEntries.length - 1 ? 0 : i + 1))}>▶</button>
                  </>
                )}

                {activeEntry.type === "item" ? (
                  <img draggable={false} src={thumbSrc(activeEntry.data)} alt={activeEntry.data.name} />
                ) : (
                  <div style={{ width: "80%", height: "80%" }}>
                    <StackThumb layers={activeEntry.data.layers} vault={vault} refW={activeEntry.data.refW} refH={activeEntry.data.refH} />
                  </div>
                )}

                <div className="badges">
                  <span className="tag mono" style={{ color: "var(--cyan)", borderColor: "var(--cyan)" }}>{safeCarouselIdx + 1} / {allEntries.length}</span>
                  {activeEntry.type === "item" ? (
                    <>
                      <span className="tag mono">{resolutionTag(activeEntry.data.width, activeEntry.data.height)}</span>
                      <span className={`tag mono ${gameClass(activeEntry.data.game)}`}>{activeEntry.data.game}</span>
                    </>
                  ) : (
                    <>
                      <span className="stack-badge mono">STACK</span>
                      {activeEntry.data.game && <span className={`tag mono ${gameClass(activeEntry.data.game)}`}>{activeEntry.data.game}</span>}
                    </>
                  )}
                </div>

                {activeEntry.type === "item" && activeId === activeEntry.data.id && <span className="live-dot mono">● ACTIVE ON SCREEN</span>}
              </div>

              <div className="carousel-stage-bar">
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "var(--text)" }}>
                    {activeEntry.type === "item" && activeEntry.data.favorite ? "★ " : ""}{activeEntry.data.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={`chip ${activeEntry.data.game ? gameClass(activeEntry.data.game) : "folder"}`}>{activeEntry.data.game || "Custom"}</span>
                    {activeEntry.type === "item" && activeEntry.data.tag && <span className="chip folder">{tagLabel(activeEntry.data.tag)}</span>}
                    {activeEntry.type === "item" && activeEntry.data.folder && <span className="chip folder">▸ {activeEntry.data.folder}</span>}
                    <span className="dims mono">
                      {activeEntry.type === "item"
                        ? `${activeEntry.data.width} × ${activeEntry.data.height}`
                        : `${activeEntry.data.refW} × ${activeEntry.data.refH} (${activeEntry.data.layers.length} layers)`}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {activeEntry.type === "item" ? (
                    <>
                      <button type="button" className={`btn small ${activeEntry.data.favorite ? "primary" : "outline"}`} onClick={() => toggleFavorite(activeEntry.data)}>
                        {activeEntry.data.favorite ? "★ Favorited" : "☆ Favorite"}
                      </button>
                      <button className="btn small primary" onClick={() => onLoad(activeEntry.data)}>Equip to Screen</button>
                      <button className="btn small outline" onClick={() => onSendToStack(activeEntry.data)}>+ Add to Stack</button>
                      <button className="btn small outline icon-btn" onClick={(e) => openItemMenu(e, activeEntry.data)}>⋯</button>
                    </>
                  ) : (
                    <>
                      <button className="btn small primary" onClick={() => onLoadPreset(activeEntry.data)}>Load Stack to Live</button>
                      <button className="btn small outline icon-btn" onClick={(e) => openPresetMenu(e, activeEntry.data)}>⋯</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="carousel-reel-wrap">
            {allEntries.map((entry, idx) => (
              <div
                key={entry.data.id}
                className={`carousel-reel-thumb checker${idx === safeCarouselIdx ? " active" : ""}`}
                onClick={() => setCarouselIdx(idx)}
                title={entry.data.name}
              >
                {entry.type === "item" ? (
                  <img draggable={false} src={thumbSrc(entry.data)} alt={entry.data.name} />
                ) : (
                  <StackThumb layers={entry.data.layers} vault={vault} refW={entry.data.refW} refH={entry.data.refH} />
                )}
                {entry.type === "item" && activeId === entry.data.id && <span className="live-dot mono" style={{ fontSize: 9 }}>●</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="vault-list">
          {presets.map((p) => (
            <div
              key={p.id}
              className={`vault-list-row card bracket${selected === p.id ? " selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); setSelected(p.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onLoadPreset(p); }}
              onContextMenu={(e) => openPresetMenu(e, p)}
            >
              <div className="vault-list-thumb checker"><StackThumb layers={p.layers} vault={vault} refW={p.refW} refH={p.refH} /></div>
              <span className="stack-badge mono" style={{ fontSize: 10 }}>STACK</span>
              <span className="vault-list-name" title={p.name}>{p.name}</span>
              {p.game && <span className={`chip ${gameClass(p.game)}`}>{p.game}</span>}
              <span className="chip folder">{p.layers.length} layers</span>
              <span className="dims mono">{p.refW}×{p.refH}</span>
              <button className="btn small primary" onClick={(e) => { e.stopPropagation(); onLoadPreset(p); }}>Load Stack</button>
              <button className="btn small outline icon-btn" onClick={(e) => openPresetMenu(e, p)}>⋯</button>
            </div>
          ))}
          {items.map((item) => (
            <div
              key={item.id}
              className={`vault-list-row card bracket${selected === item.id ? " selected" : ""}${activeId === item.id ? " live" : ""}`}
              onClick={(e) => { e.stopPropagation(); setSelected(item.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onLoad(item); }}
              onContextMenu={(e) => openItemMenu(e, item)}
            >
              <div className="vault-list-thumb checker"><img loading="lazy" draggable={false} src={thumbSrc(item)} alt={item.name} /></div>
              <button
                type="button"
                className={`fav-star-btn${item.favorite ? " active" : ""}`}
                style={{ position: "static", transform: "none", fontSize: 16 }}
                title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
                onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
              >
                {item.favorite ? "★" : "☆"}
              </button>
              <span className="vault-list-name" title={item.name}>{item.name}</span>
              <span className={`chip ${gameClass(item.game)}`}>{item.game}</span>
              {item.tag && <span className="chip folder">{tagLabel(item.tag)}</span>}
              {item.folder && <span className="chip folder">&#x25B8; {item.folder}</span>}
              <span className="dims mono">{item.width}×{item.height}</span>
              {activeId === item.id && <span className="tag mono ok">● ACTIVE</span>}
              <button className="btn small primary" onClick={(e) => { e.stopPropagation(); onLoad(item); }}>Equip</button>
              <button className="btn small outline" onClick={(e) => { e.stopPropagation(); onSendToStack(item); }}>+ Stack</button>
              <button className="btn small outline icon-btn" onClick={(e) => openItemMenu(e, item)}>⋯</button>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <div
          className="ctxmenu card"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 220) }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.item && (
            <>
              <button onClick={() => { onLoad(menu.item!); setMenu(null); }}>Load in Display</button>
              <button className="accent" onClick={() => { onSendToStack(menu.item!); setMenu(null); }}>Send to Layering Stack</button>
              <button onClick={async () => { await toggleFavorite(menu.item!); setMenu(null); }}>
                {menu.item!.favorite ? "★ Remove from Favorites" : "☆ Add to Favorites"}
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
          onSaved={(v) => { setVault(v); setDialog(null); onUpload?.(); }}
        />
      )}
      {dialog?.kind === "folder" && <FolderDialog vault={vault} onClose={() => setDialog(null)} onDone={(v, name) => { setVault(v); setFilter(name); setDialog(null); }} />}
      {dialog?.kind === "rename" && <RenameDialog item={dialog.item} onClose={() => setDialog(null)} onDone={(v) => { setVault(v); setDialog(null); }} />}
      {dialog?.kind === "move" && <MoveDialog vault={vault} item={dialog.item} onClose={() => setDialog(null)} onDone={(v) => { setVault(v); setDialog(null); }} />}
      {dialog?.kind === "delete" && (
        <Modal title="Delete overlay" onClose={() => setDialog(null)} width={420}>
          <p className="muted">Permanently remove <b>{dialog.item.name}</b> and its saved calibration from the Vault?</p>
          <div className="modal-foot">
            <button className="btn outline" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn danger-solid" onClick={async () => { setVault(await api.deleteItem(dialog.item.id)); setSelected(null); setDialog(null); }}>Delete</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "manageGames" && (
        <Modal title="Manage Game Tabs" onClose={() => setDialog(null)} width={480}>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Select which game categories appear in your Vault navigation bar. Unselected games will be hidden from the tab bar.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {FILTER_GAMES.map((game) => {
              const isVisible = !hiddenGames.includes(game);
              return (
                <label
                  key={game}
                  className="card bracket"
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer",
                    background: isVisible ? "#121424" : "#08090f", borderColor: isVisible ? "var(--cyan)" : "var(--border)",
                  }}
                >
                  <input type="checkbox" checked={isVisible} onChange={() => toggleGameVisibility(game)} />
                  <span style={{ fontWeight: isVisible ? 700 : 400, color: isVisible ? "var(--text)" : "var(--muted)" }}>{game}</span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn small outline" onClick={() => saveHiddenGames([])}>Show All</button>
              <button type="button" className="btn small outline" onClick={() => saveHiddenGames(FILTER_GAMES.filter((g) => g !== "Overwatch"))}>Overwatch Only</button>
            </div>
            <button type="button" className="btn small primary" onClick={() => setDialog(null)}>Done</button>
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
    if (reserved.includes(n.toLowerCase()) || vault.folders.some((f) => f.toLowerCase() === n.toLowerCase())) return setErr("That name is already used.");
    try { onDone(await api.createFolder(n), n); } catch (e) { setErr(String(e)); }
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
