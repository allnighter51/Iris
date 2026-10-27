import { useEffect, useState, type ReactNode } from "react";
import { clamp } from "../util";

export function Toggle({
  checked,
  onChange,
  disabled,
  large,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle${large ? " large" : ""}${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function NumField({
  value,
  onChange,
  min,
  max,
  suffix,
  width = 76,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  width?: number;
}) {
  const formatted = String(Math.round(value * 10) / 10);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (s: string) => {
    setDraft(null);
    const n = parseFloat(s);
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
  };
  return (
    <span className="numfield" style={{ width }}>
      <input
        value={draft ?? formatted}
        inputMode="decimal"
        onFocus={() => setDraft(formatted)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  extra,
  sliderClassName,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
  extra?: ReactNode;
  sliderClassName?: string;
}) {
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        <NumField value={value} onChange={onChange} min={min} max={max * 2} suffix={suffix} />
      </div>
      <input
        type="range"
        className={sliderClassName}
        min={min}
        max={max}
        value={clamp(value, min, max)}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {extra}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal card bracket" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
