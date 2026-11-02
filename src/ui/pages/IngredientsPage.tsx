import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import { computeIngredientPriceImpact } from '../../engine';
import type { ImpactItem, ImpactMetric } from '../../engine/impact';
import type { AllergenCode, Ingredient, NutritionPer100g, PriceHistoryEntry } from '../../engine/types';
import { NumberInput, SearchBar, ConfirmDialog, fmtMoney } from '../components/Shared';
import { exportIngredientsCSV, importIngredientsCSV } from '../../io/io';
import { generateId, localDateString } from '../../engine/utils';

const EMPTY_ING: Omit<Ingredient, 'id'> = {
  name: '',
  unit_type: 'g',
  pack_quantity: 0,
  pack_price: 0,
  piece_weight_g: null,
  grams_per_tsp: null,
  notes: '',
};

const ALLERGENS: { code: AllergenCode; label: string }[] = [
  { code: 'gluten', label: 'Gluten' },
  { code: 'dairy', label: 'Milk / dairy' },
  { code: 'egg', label: 'Egg' },
  { code: 'soy', label: 'Soy' },
  { code: 'nuts', label: 'Tree nuts' },
  { code: 'peanuts', label: 'Peanuts' },
  { code: 'sesame', label: 'Sesame' },
  { code: 'fish', label: 'Fish' },
  { code: 'shellfish', label: 'Crustaceans' },
  { code: 'sulphites', label: 'Sulphites' },
  { code: 'celery', label: 'Celery' },
  { code: 'mustard', label: 'Mustard' },
  { code: 'lupin', label: 'Lupin' },
  { code: 'molluscs', label: 'Molluscs' },
];

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

function getRecentPriceChangeRange(): { cutoff: string; today: string } {
  const date = new Date();
  const today = localDateString(date);
  date.setDate(date.getDate() - 30);
  return { cutoff: localDateString(date), today };
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
  const [recentlyChangedOnly, setRecentlyChangedOnly] = useState(false);
  const [showAllImpact, setShowAllImpact] = useState(false);
  const [csvMode, setCsvMode] = useState(false);
  const [csvError, setCsvError] = useState('');

  const recentIngredients = useMemo(() => {
    const { cutoff, today } = getRecentPriceChangeRange();
    return data.ingredients.filter(ingredient =>
      ingredient.price_history?.some(entry => entry.date >= cutoff && entry.date <= today),
    );
  }, [data.ingredients]);
  const recentIngredientIds = useMemo(
    () => new Set(recentIngredients.map(ingredient => ingredient.id)),
    [recentIngredients],
  );
  const recentImpactCounts = useMemo(() => {
    const recipes = new Set<string>();
    const products = new Set<string>();
    for (const ingredient of recentIngredients) {
      const history = ingredient.price_history ?? [];
      if (history.length < 2) continue;
      const impact = computeIngredientPriceImpact(data, ingredient.id, { fromEntryIndex: history.length - 2 });
      for (const item of impact?.items ?? []) {
        if (item.category === 'Recipe') recipes.add(item.id);
        if (item.category === 'Batch product' || item.category === 'Assembled product') {
          products.add(`${item.category}:${item.id}`);
        }
      }
    }
    return { recipes: recipes.size, products: products.size };
  }, [data, recentIngredients]);
  const historyImpact = useMemo(() => {
    const history = historyTarget?.price_history ?? [];
    if (history.length < 2 || !historyTarget) return null;
    return computeIngredientPriceImpact(data, historyTarget.id, { fromEntryIndex: history.length - 2 });
  }, [data, historyTarget]);

  const filtered = useMemo(() =>
    data.ingredients
      .filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.id.toLowerCase().includes(search.toLowerCase())
      )
      .filter(i => !recentlyChangedOnly || recentIngredientIds.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.ingredients, search, recentlyChangedOnly, recentIngredientIds]);

  const openNew = () => {
    setIsNew(true);
    setEditing({ id: generateId('ing'), ...EMPTY_ING });
  };

  const openEdit = (ing: Ingredient) => {
    setIsNew(false);
    setEditing({ ...ing });
  };

  const openHistory = (ing: Ingredient) => {
    setShowAllImpact(false);
    setHistoryTarget(ing);
  };

  const duplicate = (ing: Ingredient) => {
    const newId = generateId('ing');
    setIsNew(true);
    setEditing({ ...ing, id: newId, name: ing.name + ' (copy)' });
  };

  const updateNutrition = (key: keyof NutritionPer100g, value: number) => {
    setEditing(current => {
      if (!current) return current;
      const nutrition = current.nutrition_per_100g ?? {
        kcal: 0,
        protein_g: 0,
        fat_g: 0,
        carbs_g: 0,
      };
      return { ...current, nutrition_per_100g: { ...nutrition, [key]: value } };
    });
  };

  const toggleAllergen = (code: AllergenCode) => {
    setEditing(current => {
      if (!current) return current;
      const allergens = new Set(current.allergens ?? []);
      if (allergens.has(code)) allergens.delete(code);
      else allergens.add(code);
      return { ...current, allergens: [...allergens] };
    });
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
            <span>CSV Actions</span>
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
        <div className="ingredient-impact-summary">
          <div>
            <h2 className="decorations-header-title">Price impact summary</h2>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              Based on recorded ingredient price-history dates from the last 30 days.
            </div>
          </div>
          <div className="ingredient-impact-summary-stat">
            <strong>{recentIngredients.length}</strong>
            <span>ingredients changed</span>
          </div>
          <div className="ingredient-impact-summary-stat">
            <strong>{recentImpactCounts.recipes}</strong>
            <span>recipes affected</span>
          </div>
          <div className="ingredient-impact-summary-stat">
            <strong>{recentImpactCounts.products}</strong>
            <span>products affected</span>
          </div>
          <button
            className={`quote-toolbar-btn${recentlyChangedOnly ? ' quote-toolbar-btn-primary' : ''}`}
            onClick={() => setRecentlyChangedOnly(value => !value)}
            aria-pressed={recentlyChangedOnly}
          >
            {recentlyChangedOnly ? 'Show all ingredients' : 'Filter recently changed'}
          </button>
        </div>
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>grocery</span>
              <h2 className="decorations-header-title">Ingredient Catalog</h2>
            </div>
            <span className="decorations-header-right">
              {filtered.length} of {data.ingredients.length} ingredients{recentlyChangedOnly ? ' · recently changed' : ''}
            </span>
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
                            <button className="quote-toolbar-btn" onClick={() => openHistory(ing)} title="Price history" aria-label={`Price history for ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>schedule</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => openHistory(ing)} title="Price impact" aria-label={`Price impact for ${ing.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>analytics</span>
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
              <section className="ingredient-nutrition-section" aria-label="Nutrition and allergen data">
                <h3 className="decorations-header-title">Nutrition per 100 g</h3>
                <div className="ingredient-nutrition-grid">
                  {([
                    ['kcal', 'Energy (kcal)'],
                    ['protein_g', 'Protein (g)'],
                    ['fat_g', 'Fat (g)'],
                    ['carbs_g', 'Carbohydrates (g)'],
                    ['fibre_g', 'Fibre (g)'],
                    ['sodium_mg', 'Sodium (mg)'],
                  ] as const).map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label htmlFor={`ingredient-nutrition-${key}`}>{label}</label>
                      <NumberInput
                        id={`ingredient-nutrition-${key}`}
                        value={editing.nutrition_per_100g?.[key] ?? 0}
                        onChange={value => updateNutrition(key, value)}
                        min={0}
                      />
                    </div>
                  ))}
                </div>
                <h3 className="decorations-header-title">Allergens</h3>
                <div className="ingredient-allergen-grid">
                  {ALLERGENS.map(allergen => (
                    <label className="ingredient-allergen-chip" key={allergen.code}>
                      <input
                        type="checkbox"
                        checked={editing.allergens?.includes(allergen.code) ?? false}
                        onChange={() => toggleAllergen(allergen.code)}
                      />
                      <span>{allergen.label}</span>
                    </label>
                  ))}
                </div>
                <p className="ingredient-nutrition-disclaimer">
                  Approximate. Based only on ingredients with nutrition data entered. Verify before customer-facing use.
                </p>
              </section>
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
          <div className="modal modal-lg ingredient-impact-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
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
              {(historyTarget.price_history?.length ?? 0) > 0 && (
                <>
                  <PriceSparkline history={historyTarget.price_history ?? []} unitType={historyTarget.unit_type} cur={cur} />
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
                        {[...(historyTarget.price_history ?? [])].reverse().map((h, i) => {
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
              <section className="ingredient-impact-section" aria-labelledby="ingredient-impact-title">
                <div>
                  <h3 id="ingredient-impact-title" className="decorations-header-title">Impact of this price change</h3>
                  {historyImpact && (
                    <p className="text-muted ingredient-impact-range">
                      {historyImpact.from.date}: {fmtMoney(historyImpact.from.pack_price, cur)} / {historyImpact.from.pack_quantity} {historyTarget.unit_type === 'g' ? 'g' : 'pcs'}
                      {' → '}
                      {historyImpact.to.date}: {fmtMoney(historyImpact.to.pack_price, cur)} / {historyImpact.to.pack_quantity} {historyTarget.unit_type === 'g' ? 'g' : 'pcs'}
                    </p>
                  )}
                </div>
                {(historyTarget.price_history?.length ?? 0) < 2 ? (
                  <div className="text-muted ingredient-impact-empty">
                    {(historyTarget.price_history?.length ?? 0) === 0
                      ? 'No recorded price change yet. A history entry is created on the next edit.'
                      : 'One price on record; impact will populate on the next edit.'}
                  </div>
                ) : (
                  <ImpactList
                    items={historyImpact?.items ?? []}
                    currency={cur}
                    showAll={showAllImpact}
                    onShowAll={() => setShowAllImpact(true)}
                  />
                )}
              </section>
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

function ImpactList({
  items,
  currency,
  showAll,
  onShowAll,
}: {
  items: ImpactItem[];
  currency: string;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const visibleItems = showAll ? items : items.slice(0, 30);
  const remaining = items.length - visibleItems.length;

  if (items.length === 0) {
    return <div className="text-muted ingredient-impact-empty">No recipe or product costs changed between these two recorded prices.</div>;
  }

  return (
    <div className="ingredient-impact-list">
      {visibleItems.map(item => (
        <article className="ingredient-impact-item" key={`${item.category}:${item.id}`}>
          <div className="ingredient-impact-item-heading">
            <span className="badge badge-muted">{item.category}</span>
            <strong>{item.name}</strong>
          </div>
          {item.metrics.map(change => (
            <ImpactMetricView key={change.label} metric={change} currency={currency} />
          ))}
        </article>
      ))}
      {remaining > 0 && (
        <button type="button" className="ingredient-impact-more" onClick={onShowAll}>
          +{remaining} more
        </button>
      )}
    </div>
  );
}

function ImpactMetricView({ metric, currency }: { metric: ImpactMetric; currency: string }) {
  return (
    <div className="ingredient-impact-metric">
      <strong className="ingredient-impact-metric-label">{metric.label}</strong>
      <div>
        <span className="ingredient-impact-value-label">Old </span>
        <span className="td-mono">{fmtMoney(metric.oldValue, currency, 4)}</span>
      </div>
      <div>
        <span className="ingredient-impact-value-label">New </span>
        <span className="td-mono">{fmtMoney(metric.newValue, currency, 4)}</span>
      </div>
      <div>
        <span className="ingredient-impact-value-label">Delta </span>
        <span className="td-mono">{metric.delta > 0 ? '+' : ''}{fmtMoney(metric.delta, currency, 4)}</span>
      </div>
      <div>
        <span className="ingredient-impact-value-label">Change </span>
        {metric.percentageDelta === null
          ? <span className="td-mono" title="No prior cost to compare.">—</span>
          : <span className="td-mono">{metric.percentageDelta > 0 ? '+' : ''}{metric.percentageDelta.toFixed(1)}%</span>}
      </div>
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
