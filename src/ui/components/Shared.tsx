import { useState, type CSSProperties, type ReactNode } from 'react';

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
  'aria-label'?: string;
  title?: string;
  disabled?: boolean;
  allowNeg?: boolean;
}

export function NumberInput({ value, onChange, min, max, step, placeholder, className = '', id, 'aria-label': ariaLabel, title, disabled, allowNeg }: NumberInputProps) {
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
      aria-label={ariaLabel}
      title={title}
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

interface ComponentRowProps {
  type: 'cake_recipe_grams' | 'recipe_per_gram' | 'ingredient_grams' | 'recipe';
  picker: ReactNode;
  scale?: ReactNode;
  grams: ReactNode;
  remove: ReactNode;
}

const COMPONENT_ROW_TYPES: Record<ComponentRowProps['type'], { label: string; icon: string }> = {
  cake_recipe_grams: { label: 'Cake', icon: 'cake' },
  recipe_per_gram: { label: 'Recipe', icon: 'bakery_dining' },
  ingredient_grams: { label: 'Ingredient', icon: 'grocery' },
  recipe: { label: 'Recipe', icon: 'bakery_dining' },
};

export function ComponentRow({ type, picker, scale, grams, remove }: ComponentRowProps) {
  const { label, icon } = COMPONENT_ROW_TYPES[type];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <span className="badge badge-muted" style={{ fontSize: 11, flexShrink: 0 }}>
        <span className="material-symbols-outlined ms-14" aria-hidden>{icon}</span>
        {label}
      </span>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>{picker}</div>
      {scale && <div style={{ width: 80, flexShrink: 0 }}>{scale}</div>}
      <div style={{ width: 88, flexShrink: 0 }}>{grams}</div>
      {remove}
    </div>
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
  maxWidth?: number | string;
}

export function SearchBar({ value, onChange, placeholder = 'Search…', maxWidth = '100%' }: SearchBarProps) {
  return (
    <div className="search-bar search-bar-wide" style={{ '--search-bar-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } as CSSProperties}>
      <span className="search-bar-icon material-symbols-outlined ms-14" aria-hidden>search</span>
      <input
        className="input"
        style={{ paddingLeft: 32 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function fmtMoney(n: number, cur: string, decimals = 2): string {
  return `${cur} ${n.toFixed(decimals)}`;
}
