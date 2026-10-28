import { useState } from "react";
import { assetUrl } from "../api";
import { BLEND_MODES, LINK_GROUPS, ROLES, fxOf, type Layer, type LayerFx, type Role, type VaultData } from "../types";
import { roleBadge } from "../layers";
import { clamp } from "../util";
import { NumField, SliderRow } from "./ui";

const svgProps = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const EyeIcon = ({ off }: { off?: boolean }) => <svg {...svgProps}><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" /><circle cx="8" cy="8" r="2" />{off && <path d="M2 14L14 2" />}</svg>;
const LockIcon = ({ open }: { open?: boolean }) => <svg {...svgProps}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d={open ? "M5.5 7V5a2.5 2.5 0 015 0" : "M5 7V5a3 3 0 016 0v2"} /></svg>;
const CopyIcon = () => <svg {...svgProps}><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" /></svg>;
const TrashIcon = () => <svg {...svgProps}><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 7v4M9.5 7v4" /></svg>;

const HUE_SWATCHES = [
  { label: "Emerald", color: "#10B981", hue: 140 },
  { label: "Cyan", color: "#06B6D4", hue: 180 },
  { label: "Purple", color: "#8B5CF6", hue: -95 },
  { label: "Pink", color: "#EC4899", hue: -35 },
  { label: "Amber", color: "#F59E0B", hue: 45 },
  { label: "Red", color: "#EF4444", hue: 0 },
];

interface Props {
  vault: VaultData;
  layers: Layer[];
  setLayers: (f: (l: Layer[]) => Layer[]) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  update: (id: string, p: Partial<Layer>) => void;
  updateFx: (id: string, p: Partial<LayerFx>) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  roleHotkeys: Record<string, string>;
}

export interface LayerStackProps {
  vault: VaultData;
  layers: Layer[];
  setLayers: (f: (l: Layer[]) => Layer[]) => void;
  selectedId: string | null;
  selectedIds?: string[];
  select: (id: string | null, multi?: boolean) => void;
  update: (id: string, p: Partial<Layer>) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
}

export function LayerStack({ vault, layers, setLayers, selectedId, selectedIds, select, update, duplicate, remove }: LayerStackProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<{ id: string; after: boolean } | null>(null);
  const items = new Map(vault.items.map((i) => [i.id, i]));

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
    <section className="card bracket stack workbench-col">
      <div className="panel-title">
        <span>Layer Stack</span>
        <span className="mono muted small">{layers.length} layers · top = front</span>
      </div>
      <div className="rows">
        {layers.map((l, i) => {
          const it = items.get(l.vaultItemId);
          const fx = fxOf(l);
          const isSelected = selectedIds ? selectedIds.includes(l.id) : l.id === selectedId;
          return (
            <div
              key={l.id}
              className={`lrow${isSelected ? " sel" : ""}${!l.visible ? " hidden" : ""}${dragId === l.id ? " dragging" : ""}${overId?.id === l.id ? (overId.after ? " drop-after" : " drop-before") : ""}`}
              onClick={(e) => select(l.id, e.shiftKey)}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setOverId({ id: l.id, after: e.clientY > r.top + r.height / 2 });
              }}
              onDrop={(e) => { e.preventDefault(); drop(); }}
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
                onDragEnd={() => { setDragId(null); setOverId(null); }}
              >
                ⋮⋮
              </span>
              <button className={`ibtn${l.visible ? " on" : ""}`} title={l.visible ? "Hide (Alt+Shift+H)" : "Show (Alt+Shift+H)"} onClick={(e) => { e.stopPropagation(); update(l.id, { visible: !l.visible }); }}>
                <EyeIcon off={!l.visible} />
              </button>
              <button className={`ibtn${l.locked ? " lock" : ""}`} title={l.locked ? "Unlock (Alt+Shift+L)" : "Lock (Alt+Shift+L)"} onClick={(e) => { e.stopPropagation(); update(l.id, { locked: !l.locked }); }}>
                <LockIcon open={!l.locked} />
              </button>
              <div className="checker lthumb">
                {it ? <img draggable={false} src={assetUrl(it.thumb ? vault.thumbsDir : vault.assetsDir, it.thumb ?? it.file)} alt="" /> : <span className="mono">?</span>}
              </div>
              <div className="lname">
                <div className="lname-top">{l.name}</div>
                <div className="lname-sub">
                  <span className={`rbadge r-${l.role}`}>{roleBadge(l.role)}</span>
                  <span className="mono muted">z{layers.length - 1 - i}</span>
                  {fx.group && <span className="rbadge link-badge" title="Linked group — moves together">🔗{fx.group}</span>}
                  {(fx.cropT || fx.cropR || fx.cropB || fx.cropL) ? <span className="mono muted" title="Cropped">✂</span> : null}
                  {!it && <span className="mono warn">MISSING</span>}
                </div>
              </div>
              <button className="ibtn" title="Duplicate (Ctrl+D)" onClick={(e) => { e.stopPropagation(); duplicate(l.id); }}><CopyIcon /></button>
              <button className="ibtn del" title="Delete layer (Del)" onClick={(e) => { e.stopPropagation(); remove(l.id); }}><TrashIcon /></button>
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
  );
}

export interface LayerInspectorProps {
  vault: VaultData;
  layers: Layer[];
  selectedId: string | null;
  selectedIds?: string[];
  update: (id: string, p: Partial<Layer>) => void;
  updateFx: (id: string, p: Partial<LayerFx>) => void;
  roleHotkeys: Record<string, string>;
}

export function LayerInspector({ vault, layers, selectedId, selectedIds, update, updateFx, roleHotkeys }: LayerInspectorProps) {
  const [step, setStep] = useState(1);
  const items = new Map(vault.items.map((i) => [i.id, i]));
  const sel = layers.find((l) => l.id === selectedId) ?? null;
  const isMulti = (selectedIds?.length ?? 0) > 1;

  return (
    <section className="card bracket inspector-l workbench-col">
      <div className="panel-title">
        <span>Layer Inspector</span>
        {isMulti ? (
          <span className="mono ok small">{selectedIds!.length} layers selected</span>
        ) : sel ? (
          <span className="mono muted small">{items.get(sel.vaultItemId)?.width}×{items.get(sel.vaultItemId)?.height}</span>
        ) : null}
      </div>
      <div className="inspector-l-content">
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
                  {HUE_SWATCHES.map((s) => (
                    <button
                      key={s.color}
                      type="button"
                      className={`swatch-btn${Math.abs(sel.hue - s.hue) < 5 ? " active" : ""}`}
                      style={{ backgroundColor: s.color, color: s.color }}
                      title={`${s.label} (${s.hue}°)`}
                      onClick={() => update(sel.id, { hue: s.hue })}
                    />
                  ))}
                  <button type="button" className="swatch-btn swatch-reset" title="Reset layer hue" onClick={() => update(sel.id, { hue: 0 })}>Reset</button>
                </div>
              }
            />
            <FxControls layer={sel} updateFx={updateFx} />
          </fieldset>
        )}
      </div>
    </section>
  );
}

export function LayerPanel({ vault, layers, setLayers, selectedId, select, update, updateFx, duplicate, remove, roleHotkeys }: Props) {
  return (
    <>
      <LayerStack
        vault={vault}
        layers={layers}
        setLayers={setLayers}
        selectedId={selectedId}
        select={select}
        update={update}
        duplicate={duplicate}
        remove={remove}
      />
      <LayerInspector
        vault={vault}
        layers={layers}
        selectedId={selectedId}
        update={update}
        updateFx={updateFx}
        roleHotkeys={roleHotkeys}
      />
    </>
  );
}

function FxControls({ layer, updateFx }: { layer: Layer; updateFx: (id: string, p: Partial<LayerFx>) => void }) {
  const fx = fxOf(layer);
  const crops = [["cropT", "Top"], ["cropB", "Bottom"], ["cropL", "Left"], ["cropR", "Right"]] as const;
  const anyCrop = fx.cropT || fx.cropR || fx.cropB || fx.cropL;
  return (
    <>
      <h5 className="section">Blend, Crop &amp; Link</h5>
      <div className="field">
        <label>Blend Mode</label>
        <select className="input full" value={fx.blend || "normal"} onChange={(e) => updateFx(layer.id, { blend: e.target.value })}>
          {BLEND_MODES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <div className="muted small hk">Blends with the layers beneath it in this stack.</div>
      </div>
      <div className="field">
        <div className="field-head">
          <label>Crop (% trimmed)</label>
          <button className="btn small outline" disabled={!anyCrop} onClick={() => updateFx(layer.id, { cropT: 0, cropR: 0, cropB: 0, cropL: 0 })}>Reset Crop</button>
        </div>
        <div className="crop-grid">
          {crops.map(([k, label]) => (
            <div key={k} className="xy">
              <span className="mono muted">{label[0]}</span>
              <NumField value={fx[k]} min={0} max={95} width={64} onChange={(v) => updateFx(layer.id, { [k]: clamp(v, 0, 95) } as Partial<LayerFx>)} />
            </div>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field-head"><label>Mirror</label></div>
        <div className="btn-row">
          <button className={`btn small ${fx.flipX ? "primary" : "outline"}`} onClick={() => updateFx(layer.id, { flipX: !fx.flipX })}>⇆ Flip Horizontal</button>
          <button className={`btn small ${fx.flipY ? "primary" : "outline"}`} onClick={() => updateFx(layer.id, { flipY: !fx.flipY })}>⇅ Flip Vertical</button>
        </div>
      </div>
      <div className="field">
        <label>Link Group</label>
        <select className="input full" value={fx.group ?? ""} onChange={(e) => updateFx(layer.id, { group: e.target.value || null })}>
          <option value="">Not linked</option>
          {LINK_GROUPS.map((g) => <option key={g} value={g}>🔗 Group {g} — moves together</option>)}
        </select>
      </div>
    </>
  );
}
