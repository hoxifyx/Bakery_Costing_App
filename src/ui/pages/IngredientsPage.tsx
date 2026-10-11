import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Ingredient, PriceHistoryEntry } from '../../engine/types';
import { NumberInput, SearchBar, ConfirmDialog, fmtMoney } from '../components/Shared';
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
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Catalog</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Ingredients</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Ingredients</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn" onClick={() => setCsvMode(m => !m)}>
            <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
            <span>Export CSV</span>
          </button>
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>Add ingredient</span>
          </button>
        </div>
      </div>

      {csvMode && (
        <div className="quote-section-card" style={{ marginTop: 16 }}>
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>table_view</span>
              <h2 className="decorations-header-title">CSV Actions</h2>
            </div>
            <span className="decorations-header-right">Spreadsheet sync</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="quote-toolbar-btn" onClick={exportCSV}>
              <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
              <span>Export CSV</span>
            </button>
            <label className="quote-toolbar-btn" style={{ cursor: 'pointer' }}>
              <span className="material-symbols-outlined ms-16" aria-hidden>upload</span>
              <span>Import CSV</span>
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => importCSV(e, false)} />
            </label>
            <label className="quote-toolbar-btn" style={{ cursor: 'pointer' }}>
              <span className="material-symbols-outlined ms-16" aria-hidden>payments</span>
              <span>Update prices only</span>
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => importCSV(e, true)} />
            </label>
          </div>
          {csvError && (
            <div className="error-banner" style={{ marginTop: 12 }}>{csvError}</div>
          )}
        </div>
      )}

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>grocery</span>
              <h2 className="decorations-header-title">Ingredient Catalog</h2>
            </div>
            <span className="decorations-header-right">{filtered.length} of {data.ingredients.length} ingredients</span>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients…" maxWidth={420} />

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>grocery</span>
              </div>
              <div className="empty-state-title">{search ? 'No ingredients found' : 'No ingredients yet'}</div>
              <div className="empty-state-text">{search ? 'Try a different search term' : 'Add your first ingredient to get started'}</div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
                <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                <span>Add ingredient</span>
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Pack Qty</th>
                    <th>Pack Price</th>
                    <th>Per Kg / Piece</th>
                    <th>Piece Weight</th>
                    <th>g/tsp</th>
                    <th>Used In</th>
                    <th>Status</th>
                    <th>Actions</th>
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
                        <td className="td-mono">{fmtMoney(ing.pack_price, cur)}</td>
                        <td className="td-mono text-green">{fmtMoney(perKg, cur, 4)}</td>
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
                            <button className="quote-toolbar-btn" onClick={() => setHistoryTarget(ing)} title="Price history" aria-label={`Price history for ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>schedule</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => openEdit(ing)} title="Edit" aria-label={`Edit ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => duplicate(ing)} title="Duplicate" aria-label={`Duplicate ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => confirmDelete(ing)} title="Delete" aria-label={`Delete ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                            </button>
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
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'Add ingredient' : `Edit: ${editing.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
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
                  Price per {editing.unit_type === 'g' ? 'kg' : 'piece'}: {fmtMoney(
                    editing.unit_type === 'g'
                      ? editing.pack_price / editing.pack_quantity * 1000
                      : editing.pack_price / editing.pack_quantity,
                    cur,
                    4,
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={save} disabled={!editing.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
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
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>schedule</span>
                Price History — {historyTarget.name}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setHistoryTarget(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
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
                          <th>Pack Qty</th>
                          <th>Pack Price</th>
                          <th>Per {historyTarget.unit_type === 'g' ? 'Kg' : 'Piece'}</th>
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
                              <td className="td-mono">{fmtMoney(h.pack_price, cur)}</td>
                              <td className="td-mono text-green">{fmtMoney(perUnit, cur, 4)}</td>
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
                Current: {fmtMoney(historyTarget.pack_price, cur)} / {historyTarget.pack_quantity} {historyTarget.unit_type === 'g' ? 'g' : 'pcs'}
              </div>
              <button className="quote-toolbar-btn" onClick={() => setHistoryTarget(null)}>Close</button>
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
        Current: {fmtMoney(last, cur, 4)}
      </div>
    </div>
  );
}
