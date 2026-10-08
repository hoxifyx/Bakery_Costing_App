import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Ingredient, PriceHistoryEntry } from '../../engine/types';
import { NumberInput, SearchBar, ConfirmDialog } from '../components/Shared';
import { exportIngredientsCSV, importIngredientsCSV } from '../../io/io';
import { generateId } from '../../engine/utils';

const EMPTY_ING: Omit<Ingredient, 'id'> = {
  name: '',
  unit_type: 'g',
  pack_quantity: 0,
  pack_price: 0,
  piece_weight_g: null,
  grams_per_tsp: null,
  notes: '',
};

function getUsedIn(id: string, data: ReturnType<typeof useStore>['state']['data']): string[] {
  const used: string[] = [];
  for (const r of data.recipes) {
    if (r.lines.some(l => l.ingredient_id === id)) used.push(`Recipe: ${r.name}`);
  }
  for (const f of data.fillings) {
    if (f.source.type === 'ingredient' && f.source.ingredient_id === id) used.push(`Filling: ${f.name}`);
  }
  for (const ap of data.assembled_products) {
    if (ap.components.some(c => c.type === 'ingredient_grams' && c.ingredient_id === id)) used.push(`Product: ${ap.name}`);
  }
  if (data.settings.fondant_ingredient_id === id) used.push('Settings: Fondant role');
  return used;
}

export function IngredientsPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Ingredient | null>(null);
  const [csvMode, setCsvMode] = useState(false);
  const [csvError, setCsvError] = useState('');

  const filtered = useMemo(() =>
    data.ingredients
      .filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.id.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.ingredients, search]);

  const openNew = () => {
    setIsNew(true);
    setEditing({ id: generateId('ing'), ...EMPTY_ING });
  };

  const openEdit = (ing: Ingredient) => {
    setIsNew(false);
    setEditing({ ...ing });
  };

  const duplicate = (ing: Ingredient) => {
    const newId = generateId('ing');
    setIsNew(true);
    setEditing({ ...ing, id: newId, name: ing.name + ' (copy)' });
  };

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    const normalized = { ...editing, name: editing.name.trim() };
    if (isNew) dispatch({ type: 'ADD_INGREDIENT', item: normalized });
    else dispatch({ type: 'UPDATE_INGREDIENT', item: normalized });
    setEditing(null);
  };

  const confirmDelete = (ing: Ingredient) => {
    const used = getUsedIn(ing.id, data);
    if (used.length > 0) {
      alert(`Cannot delete "${ing.name}" — used in:\n${used.join('\n')}`);
      return;
    }
    setDeleteTarget(ing);
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_INGREDIENT', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const exportCSV = () => {
    const csv = exportIngredientsCSV(data.ingredients);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ingredients.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>, pricesOnly = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      const { items, errors } = importIngredientsCSV(content, data.ingredients, pricesOnly);
      if (errors.length > 0) { setCsvError(errors.join('\n')); return; }
      // Replace all
      dispatch({ type: 'IMPORT_DATA', data: { ingredients: items }, mode: 'replace_selected' });
      setCsvMode(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">🧂 Ingredients</h1>
            <p className="page-subtitle">{data.ingredients.length} items · Prices per gram or per piece</p>
          </div>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={() => setCsvMode(m => !m)}>CSV ▾</button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Add ingredient</button>
          </div>
        </div>
        {csvMode && (
          <div className="card mt-12" style={{ marginTop: 12 }}>
            <div className="flex gap-8 flex-wrap">
              <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                ⬆ Import CSV <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => importCSV(e, false)} />
              </label>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                💰 Update prices only <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => importCSV(e, true)} />
              </label>
            </div>
            {csvError && <div className="error-banner mt-8">{csvError}</div>}
          </div>
        )}
      </div>

      <div className="page-body">
        <div className="flex justify-between items-center mb-12">
          <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients…" />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧂</div>
            <div className="empty-state-title">No ingredients yet</div>
            <div className="empty-state-text">Add your first ingredient to get started</div>
            <button className="btn btn-primary" onClick={openNew}>+ Add ingredient</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Pack qty</th>
                  <th>Pack price</th>
                  <th>Per kg / piece</th>
                  <th>Piece weight</th>
                  <th>g/tsp</th>
                  <th>Used in</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ing => {
                  const ppu = ing.pack_quantity > 0 ? ing.pack_price / ing.pack_quantity : 0;
                  const perKg = ing.unit_type === 'g' ? ppu * 1000 : ppu;
                  const priced = ing.pack_quantity > 0 && ing.pack_price > 0;
                  const usedIn = getUsedIn(ing.id, data).length;
                  return (
                    <tr key={ing.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{ing.name}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{ing.id}</div>
                      </td>
                      <td><span className="badge badge-muted">{ing.unit_type}</span></td>
                      <td className="td-mono">{ing.pack_quantity}</td>
                      <td className="td-mono">{cur} {ing.pack_price.toFixed(2)}</td>
                      <td className="td-mono text-green">{cur} {perKg.toFixed(2)}</td>
                      <td className="td-mono">{ing.piece_weight_g ? `${ing.piece_weight_g}g` : '—'}</td>
                      <td className="td-mono">{ing.grams_per_tsp ?? '—'}</td>
                      <td className="text-secondary text-sm">{usedIn || '—'}</td>
                      <td>
                        {!priced
                          ? <span className="badge badge-amber">Unpriced</span>
                          : <span className="badge badge-green">Priced</span>}
                      </td>
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setHistoryTarget(ing)} title="Price history">🕐</button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(ing)} title="Edit">✏️</button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => duplicate(ing)} title="Duplicate">📋</button>
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => confirmDelete(ing)} title="Delete">🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isNew ? 'Add ingredient' : `Edit: ${editing.name}`}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="input" value={editing.name} onChange={e => setEditing(v => v && ({ ...v, name: e.target.value }))} placeholder="e.g. All-purpose flour" />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Unit type</label>
                  <select className="select" value={editing.unit_type} onChange={e => setEditing(v => v && ({ ...v, unit_type: e.target.value as 'g' | 'piece' }))}>
                    <option value="g">Grams (g) — bulk/liquid</option>
                    <option value="piece">Piece — eggs, lemons …</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Pack quantity ({editing.unit_type === 'g' ? 'grams in pack' : 'pieces in pack'})</label>
                  <NumberInput value={editing.pack_quantity} onChange={v => setEditing(p => p && ({ ...p, pack_quantity: v }))} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Pack price ({cur})</label>
                  <NumberInput value={editing.pack_price} onChange={v => setEditing(p => p && ({ ...p, pack_price: v }))} step={0.01} />
                </div>
                {editing.unit_type === 'piece' && (
                  <div className="form-group">
                    <label>Piece weight (grams)</label>
                    <NumberInput value={editing.piece_weight_g ?? 0} onChange={v => setEditing(p => p && ({ ...p, piece_weight_g: v }))} />
                    <span className="input-hint">e.g. 50 for an egg</span>
                  </div>
                )}
                {editing.unit_type === 'g' && (
                  <div className="form-group">
                    <label>Grams per teaspoon</label>
                    <NumberInput value={editing.grams_per_tsp ?? 0} onChange={v => setEditing(p => p && ({ ...p, grams_per_tsp: v || null }))} />
                    <span className="input-hint">e.g. 6 for salt, 5 for baking powder</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <input className="input" value={editing.notes ?? ''} onChange={e => setEditing(p => p && ({ ...p, notes: e.target.value }))} />
              </div>
              {editing.pack_quantity > 0 && editing.pack_price > 0 && (
                <div className="success-banner">
                  Price per {editing.unit_type === 'g' ? 'kg' : 'piece'}: {cur} {
                    editing.unit_type === 'g'
                      ? (editing.pack_price / editing.pack_quantity * 1000).toFixed(2)
                      : (editing.pack_price / editing.pack_quantity).toFixed(2)
                  }
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!editing.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
          danger
        />
      )}

      {/* Price History Modal */}
      {historyTarget && (
        <div className="modal-backdrop" onClick={() => setHistoryTarget(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">🕐 Price History — {historyTarget.name}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              {(!historyTarget.price_history || historyTarget.price_history.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  No price history yet. Editing and saving the pack price or quantity will automatically log an entry.
                </div>
              ) : (
                <>
                  <PriceSparkline history={historyTarget.price_history} unitType={historyTarget.unit_type} cur={cur} />
                  <div className="table-wrapper" style={{ marginTop: 16 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Pack qty</th>
                          <th>Pack price</th>
                          <th>Per {historyTarget.unit_type === 'g' ? 'kg' : 'piece'}</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...historyTarget.price_history].reverse().map((h, i) => {
                          const perUnit = h.pack_quantity > 0
                            ? (historyTarget.unit_type === 'g' ? h.pack_price / h.pack_quantity * 1000 : h.pack_price / h.pack_quantity)
                            : 0;
                          return (
                            <tr key={i}>
                              <td className="td-mono">{h.date}</td>
                              <td className="td-mono">{h.pack_quantity}</td>
                              <td className="td-mono">{cur} {h.pack_price.toFixed(2)}</td>
                              <td className="td-mono text-green">{cur} {perUnit.toFixed(2)}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.note || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                Current: {cur} {historyTarget.pack_price.toFixed(2)} / {historyTarget.pack_quantity} {historyTarget.unit_type === 'g' ? 'g' : 'pcs'}
              </div>
              <button className="btn btn-ghost" onClick={() => setHistoryTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline component (pure SVG, no external deps)
// ---------------------------------------------------------------------------
function PriceSparkline({ history, unitType, cur }: { history: PriceHistoryEntry[]; unitType: 'g' | 'piece'; cur: string }) {
  const values = history.map(h => h.pack_quantity > 0 ? (unitType === 'g' ? h.pack_price / h.pack_quantity * 1000 : h.pack_price / h.pack_quantity) : 0);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 540, H = 80, PAD = 8;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = values[values.length - 1];
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Price per {unitType === 'g' ? 'kg' : 'piece'} over time</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => {
          const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
          const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
          return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />;
        })}
      </svg>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
        Current: {cur} {last.toFixed(2)}
      </div>
    </div>
  );
}
