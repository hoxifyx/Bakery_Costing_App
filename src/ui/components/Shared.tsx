import { useState } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
}

export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <label className="toggle" htmlFor={id} style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0 }}
      />
      <span
        style={{
          display: 'inline-block',
          width: 36, height: 20,
          background: checked ? 'var(--accent)' : 'var(--bg-input)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 20,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2, left: 2,
            width: 14, height: 14,
            background: 'white',
            borderRadius: '50%',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 120ms',
          }}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  allowNeg?: boolean;
}

export function NumberInput({ value, onChange, min, max, step, placeholder, className = '', id, disabled, allowNeg }: NumberInputProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const effectiveMin = min !== undefined ? min : (allowNeg ? undefined : 0);

  return (
    <input
      type="number"
      id={id}
      className={`input ${className}`}
      value={raw !== null ? raw : (value === 0 ? '' : value)}
      min={effectiveMin}
      max={max}
      step={step}
      placeholder={placeholder ?? '0'}
      disabled={disabled}
      onChange={e => {
        setRaw(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n) && isFinite(n)) onChange(n);
        else if (e.target.value === '' || e.target.value === '-') onChange(0);
      }}
      onBlur={() => setRaw(null)}
    />
  );
}

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2 className="modal-title">Confirm</h2></div>
        <div className="modal-body"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{message}</p></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search…' }: SearchBarProps) {
  return (
    <div className="search-bar" style={{ maxWidth: 280 }}>
      <span className="search-bar-icon material-symbols-outlined ms-14" aria-hidden>search</span>
      <input
        className="input"
        style={{ paddingLeft: 32 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
