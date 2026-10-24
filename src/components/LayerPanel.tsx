import { useState } from "react";
import { assetUrl } from "../api";
import { ROLES, type Layer, type Role, type VaultData } from "../types";
import { roleBadge } from "../layers";
import { clamp } from "../util";
import { CopyIcon, EyeIcon, LockIcon, TrashIcon } from "./icons";
import { NumField, SliderRow } from "./ui";

interface Props {
  vault: VaultData;
  layers: Layer[];
  setLayers: (f: (l: Layer[]) => Layer[]) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  update: (id: string, p: Partial<Layer>) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  roleHotkeys: Record<string, string>;
}

/** Right panel: stack manager (top) + selected-layer inspector (bottom). */
export function LayerPanel({ vault, layers, setLayers, selectedId, select, update, duplicate, remove, roleHotkeys }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<{ id: string; after: boolean } | null>(null);
  const [step, setStep] = useState(1);
  const items = new Map(vault.items.map((i) => [i.id, i]));
  const sel = layers.find((l) => l.id === selectedId) ?? null;

  const drop = () => {
    if (dragId && overId && dragId !== overId.id) {
      setLayers((ls) => {
        const moving = ls.find((l) => l.id === dragId)!;
        const rest = ls.filter((l) => l.id !== dragId);
        const idx = rest.findIndex((l) => l.id === overId.id) + (overId.after ? 1 : 0);
        rest.splice(idx, 0, moving);
        return rest;
      });
    }
    setDragId(null);
    setOverId(null);
  };

  return (
    <aside className="stackpanel">
      <section className="card bracket stack">
        <div className="panel-title">
          <span>Layer Stack</span>
          <span className="mono muted small">{layers.length} layers · top = front</span>
        </div>
        <div className="rows">
          {layers.map((l, i) => {
            const it = items.get(l.vaultItemId);
            const z = layers.length - 1 - i;
            return (
              <div
                key={l.id}
                className={`lrow${l.id === selectedId ? " sel" : ""}${!l.visible ? " hidden" : ""}${dragId === l.id ? " dragging" : ""}${overId?.id === l.id ? (overId.after ? " drop-after" : " drop-before") : ""}`}
                onClick={() => select(l.id)}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setOverId({ id: l.id, after: e.clientY > r.top + r.height / 2 });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop();
                }}
              >
                <span
                  className="handle"
                  draggable
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    const row = e.currentTarget.closest(".lrow") as HTMLElement;
                    e.dataTransfer.setDragImage(row, 12, 12);
                    e.dataTransfer.setData("application/x-iris-layer", l.id);
                    setDragId(l.id);
                    select(l.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  ⋮⋮
                </span>
                <button className={`ibtn${l.visible ? " on" : ""}`} title={l.visible ? "Hide" : "Show"} onClick={(e) => { e.stopPropagation(); update(l.id, { visible: !l.visible }); }}>
                  <EyeIcon off={!l.visible} />
                </button>
                <button className={`ibtn${l.locked ? " lock" : ""}`} title={l.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); update(l.id, { locked: !l.locked }); }}>
                  <LockIcon open={!l.locked} />
                </button>
                <div className="checker lthumb">
                  {it ? <img draggable={false} src={assetUrl(it.thumb ? vault.thumbsDir : vault.assetsDir, it.thumb ?? it.file)} alt="" /> : <span className="mono">?</span>}
                </div>
                <div className="lname">
                  <div className="lname-top">{l.name}</div>
                  <div className="lname-sub">
                    <span className={`rbadge r-${l.role}`}>{roleBadge(l.role)}</span>
                    <span className="mono muted">z{z}</span>
                    {!it && <span className="mono warn">MISSING</span>}
                  </div>
                </div>
                <button className="ibtn" title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicate(l.id); }}><CopyIcon /></button>
                <button className="ibtn del" title="Delete layer" onClick={(e) => { e.stopPropagation(); remove(l.id); }}><TrashIcon /></button>
              </div>
            );
          })}
          {!layers.length && (
            <div className="muted small empty-note">
              The stack is empty. Add elements from the Vault Drawer, drop them on the canvas, or right-click a Vault card → “Send to Layering Stack”.
            </div>
          )}
        </div>
      </section>

      <section className="card bracket inspector-l">
        <div className="panel-title">
          <span>Layer Inspector</span>
          {sel && <span className="mono muted small">{items.get(sel.vaultItemId)?.width}×{items.get(sel.vaultItemId)?.height}</span>}
        </div>
        {!sel ? (
          <div className="muted small empty-note">Select a layer to edit its transform.</div>
        ) : (
          <fieldset className="plain" disabled={sel.locked}>
            {sel.locked && <div className="note mono">🔒 LAYER LOCKED — unlock to edit</div>}
            <div className="field">
              <label>Layer Tag / Role</label>
              <select className="input full" value={sel.role} onChange={(e) => update(sel.id, { role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              {roleHotkeys[sel.role] && <div className="mono small muted hk">⌨ toggles with {roleHotkeys[sel.role]}</div>}
            </div>

            <div className="field">
              <div className="field-head">
                <label>Position (X / Y)</label>
                <select className="input mini" value={step} onChange={(e) => setStep(Number(e.target.value))}>
                  <option value={1}>1 px</option><option value={5}>5 px</option><option value={25}>25 px</option>
                </select>
              </div>
              <div className="pos-row">
                <div className="xy">
                  <span className="mono muted">X</span>
                  <NumField value={sel.x} min={-8000} max={8000} width={84} onChange={(v) => update(sel.id, { x: v })} />
                  <span className="mono muted">Y</span>
                  <NumField value={sel.y} min={-8000} max={8000} width={84} onChange={(v) => update(sel.id, { y: v })} />
                </div>
                <div className="dpad">
                  <button style={{ gridArea: "u" }} onClick={() => update(sel.id, { y: sel.y - step })}>▲</button>
                  <button style={{ gridArea: "l" }} onClick={() => update(sel.id, { x: sel.x - step })}>◀</button>
                  <button style={{ gridArea: "c" }} title="Center" onClick={() => update(sel.id, { x: 0, y: 0 })}>●</button>
                  <button style={{ gridArea: "r" }} onClick={() => update(sel.id, { x: sel.x + step })}>▶</button>
                  <button style={{ gridArea: "d" }} onClick={() => update(sel.id, { y: sel.y + step })}>▼</button>
                </div>
              </div>
            </div>

            <SliderRow
              label="Scale"
              value={sel.scale}
              min={10}
              max={200}
              suffix="%"
              onChange={(v) => update(sel.id, { scale: clamp(v, 1, 400) })}
              extra={<button className="btn small outline" onClick={() => update(sel.id, { scale: 100 })}>Reset to 1:1 Native</button>}
            />
            <SliderRow label="Layer Opacity" value={sel.opacity} min={0} max={100} suffix="%" onChange={(v) => update(sel.id, { opacity: clamp(v, 0, 100) })} />
            <SliderRow
              label="Hue / Tint"
              value={sel.hue}
              min={-180}
              max={180}
              suffix="°"
              sliderClassName="hue-slider"
              onChange={(v) => update(sel.id, { hue: clamp(v, -180, 180) })}
              extra={
                <div className="swatches-row">
                  {[
                    { label: "Emerald", color: "#10B981", hue: 140 },
                    { label: "Cyan", color: "#06B6D4", hue: 180 },
                    { label: "Purple", color: "#8B5CF6", hue: -95 },
                    { label: "Pink", color: "#EC4899", hue: -35 },
                    { label: "Amber", color: "#F59E0B", hue: 45 },
                    { label: "Red", color: "#EF4444", hue: 0 },
                  ].map((s) => (
                    <button
                      key={s.color}
                      type="button"
                      className={`swatch-btn${Math.abs(sel.hue - s.hue) < 5 ? " active" : ""}`}
                      style={{ backgroundColor: s.color, color: s.color }}
                      title={`${s.label} (${s.hue}°)`}
                      onClick={() => update(sel.id, { hue: s.hue })}
                    />
                  ))}
                  <button
                    type="button"
                    className="swatch-btn swatch-reset"
                    title="Reset layer hue"
                    onClick={() => update(sel.id, { hue: 0 })}
                  >
                    Reset
                  </button>
                </div>
              }
            />
          </fieldset>
        )}
      </section>
    </aside>
  );
}
