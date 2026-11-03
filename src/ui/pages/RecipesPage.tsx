import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Recipe, RecipeLine } from '../../engine/types';
import { compute } from '../../engine/engine';
import { computeAllergens, computeNutrition } from '../../engine';
import { NumberInput, SearchBar, ConfirmDialog, fmtMoney } from '../components/Shared';
import { ExplainPanel } from '../components/ExplainPanel';
import { WarningsList } from '../components/WarningsList';
import { generateId } from '../../engine/utils';
import { displayWastePercent } from '../utils';

function emptyLine(): RecipeLine {
  return { ingredient_id: null, quantity: 0, unit: 'g' };
}

const KIND_LABELS: Record<string, string> = {
  cake: 'Cake',
  frosting_filling: 'Frosting / Filling',
  batch_product: 'Batch product',
  other: 'Other',
};

const KIND_ICONS: Record<Recipe['kind'], string> = {
  cake: 'cake',
  frosting_filling: 'bakery_dining',
  batch_product: 'cookie',
  other: 'inventory_2',
};

export function RecipesPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [explainTarget, setExplainTarget] = useState<Recipe | null>(null);
  const [scales, setScales] = useState<Record<string, number>>({});

  const baseResult = useMemo(() => compute(data), [data]);
  const result = useMemo(() => compute(data, null, scales), [data, scales]);
  const previewData = useMemo(() => editing
    ? { ...data, recipes: [...data.recipes.filter(recipe => recipe.id !== editing.id), editing] }
    : null, [data, editing]);
  const nutrition = useMemo(() => previewData && editing ? computeNutrition(previewData, editing.id) : null, [previewData, editing]);
  const allergens = useMemo(() => previewData && editing ? computeAllergens(previewData, editing.id) : null, [previewData, editing]);

  const filtered = useMemo(() => data.recipes.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
    const matchKind = kindFilter === 'all' || r.kind === kindFilter;
    return matchSearch && matchKind;
  }).sort((a, b) => a.name.localeCompare(b.name)), [data.recipes, search, kindFilter]);

  const validUnitsForIng = (ingId: string | null): RecipeLine['unit'][] => {
    if (!ingId) return ['g'];
    const ing = data.ingredients.find(i => i.id === ingId);
    if (!ing) return ['g'];
    if (ing.unit_type === 'piece') return ['piece'];
    const units: RecipeLine['unit'][] = ['g'];
    if (ing.grams_per_tsp) units.push('tsp');
    return units;
  };

  const openNew = () => {
    setSaveErrors([]);
    setIsNew(true);
    setEditing({
      id: generateId('recipe'),
      name: '',
      kind: 'cake',
      lines: [emptyLine()],
      weight_adjustment_g: 0,
      waste_pct: 0,
    });
  };

  const openEdit = (r: Recipe) => { setSaveErrors([]); setIsNew(false); setEditing(JSON.parse(JSON.stringify(r))); };

  const duplicate = (r: Recipe) => {
    setSaveErrors([]);
    setIsNew(true);
    setEditing({ ...JSON.parse(JSON.stringify(r)), id: generateId('recipe'), name: r.name + ' (copy)' });
  };

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    const invalidLines = editing.lines.flatMap((line, index) => {
      if (validUnitsForIng(line.ingredient_id).includes(line.unit)) return [];
      const ingredient = data.ingredients.find(item => item.id === line.ingredient_id);
      return [`${editing.name} — line ${index + 1}: ${ingredient?.name ?? line.ingredient_id ?? 'Unlinked ingredient'} uses unit "${line.unit}", which is not valid for that ingredient.`];
    });
    if (invalidLines.length > 0) {
      setSaveErrors(invalidLines);
      return;
    }
    setSaveErrors([]);
    if (isNew) dispatch({ type: 'ADD_RECIPE', item: editing });
    else dispatch({ type: 'UPDATE_RECIPE', item: editing });
    setEditing(null);
  };

  const getUsedIn = (id: string) => {
    const used: string[] = [];
    for (const f of data.flavours) {
      if (f.cost_model.type === 'recipe') {
        if (f.cost_model.cake_recipe_id === id || f.cost_model.frosting_recipe_id === id) used.push(`Flavour: ${f.name}`);
      }
    }
    for (const fi of data.fillings) {
      if (fi.source.type === 'recipe' && fi.source.recipe_id === id) used.push(`Filling: ${fi.name}`);
    }
    for (const bp of data.batch_products) {
      if (bp.recipe_id === id) used.push(`Batch product: ${bp.name}`);
      if (bp.components.some(c => c.recipe_id === id)) used.push(`Batch product component: ${bp.name}`);
    }
    for (const ap of data.assembled_products) {
      if (ap.components.some(c => (c.type === 'cake_recipe_grams' || c.type === 'recipe_per_gram') && c.recipe_id === id)) {
        used.push(`Assembled product: ${ap.name}`);
      }
    }
    return used;
  };

  const confirmDelete = (r: Recipe) => {
    const used = getUsedIn(r.id);
    if (used.length > 0) { alert(`Cannot delete "${r.name}" — used in:\n${used.join('\n')}`); return; }
    setDeleteTarget(r);
  };

  // Editing helpers
  const updateLine = (idx: number, update: Partial<RecipeLine>) => {
    setSaveErrors([]);
    setEditing(r => {
      if (!r) return r;
      const lines = r.lines.map((l, i) => i === idx ? { ...l, ...update } : l);
      return { ...r, lines };
    });
  };

  const addLine = () => setEditing(r => r ? { ...r, lines: [...r.lines, emptyLine()] } : r);

  const removeLine = (idx: number) => setEditing(r => {
    if (!r) return r;
    return { ...r, lines: r.lines.filter((_, i) => i !== idx) };
  });

  return (
    <div>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Catalog</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Recipes</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Recipes</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>Add recipe</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="tabs" role="tablist" aria-label="Filter recipes by kind">
          {['all', ...Object.keys(KIND_LABELS)].map(k => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kindFilter === k}
              className={`tab ${kindFilter === k ? 'active' : ''}`}
              onClick={() => setKindFilter(k)}
            >
              {k === 'all' ? 'All' : KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>menu_book</span>
              <h2 className="decorations-header-title">Recipe Catalog</h2>
            </div>
            <span className="decorations-header-right">{filtered.length} of {data.recipes.length} recipes</span>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search recipes…" maxWidth={420} />

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>menu_book</span>
              </div>
              <div className="empty-state-title">{search || kindFilter !== 'all' ? 'No recipes found' : 'No recipes yet'}</div>
              <div className="empty-state-text">{search || kindFilter !== 'all' ? 'Try a different search or kind filter' : 'Add your first recipe to get started'}</div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
                <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                <span>Add recipe</span>
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Lines</th>
                    <th>Scale</th>
                    <th>Raw Cost</th>
                    <th>CWO</th>
                    <th>Weight</th>
                    <th>Per Gram</th>
                    <th>Cake / Kg</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const res = result.recipes[r.id];
                    const baseRes = baseResult.recipes[r.id];
                    const scale = scales[r.id] ?? 1;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.id}</div>
                        </td>
                        <td>
                          <span className="badge badge-muted">
                            <span className="material-symbols-outlined ms-14" aria-hidden>{KIND_ICONS[r.kind]}</span>
                            {KIND_LABELS[r.kind]}
                          </span>
                        </td>
                        <td className="text-secondary">{r.lines.length}</td>
                        <td>
                          <div style={{ width: 60 }}>
                            <NumberInput value={scale} onChange={v => setScales(s => ({ ...s, [r.id]: v }))} min={0} step={0.1} />
                          </div>
                        </td>
                        <td className="td-mono">
                          {scale !== 1 && <div className="text-muted" style={{ textDecoration: 'line-through', fontSize: 11 }}>{baseRes ? fmtMoney(baseRes.raw, cur) : '—'}</div>}
                          {res ? fmtMoney(res.raw, cur) : '—'}
                        </td>
                        <td className="td-mono text-green">
                          {scale !== 1 && <div className="text-muted" style={{ textDecoration: 'line-through', fontSize: 11 }}>{baseRes ? fmtMoney(baseRes.cwo, cur) : '—'}</div>}
                          {res ? fmtMoney(res.cwo, cur) : '—'}
                        </td>
                        <td className="td-mono">
                          {scale !== 1 && <div className="text-muted" style={{ textDecoration: 'line-through', fontSize: 11 }}>{baseRes?.weight.toFixed(0)}g</div>}
                          {res?.weight.toFixed(0) ?? '—'}g
                        </td>
                        <td className="td-mono">
                          {scale !== 1 && <div className="text-muted" style={{ textDecoration: 'line-through', fontSize: 11 }}>{baseRes ? fmtMoney(baseRes.per_gram_cwo, cur, 4) : '—'}</div>}
                          {res ? fmtMoney(res.per_gram_cwo, cur, 4) : '—'}
                        </td>
                        <td className="td-mono text-green">
                          {scale !== 1 && <div className="text-muted" style={{ textDecoration: 'line-through', fontSize: 11 }}>{baseRes ? fmtMoney(baseRes.cake_cost_per_kg, cur, 4) : '—'}</div>}
                          {res ? fmtMoney(res.cake_cost_per_kg, cur, 4) : '—'}
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="quote-toolbar-btn" onClick={() => setExplainTarget(r)} title={`Explain ${r.name}`} aria-label={`Explain ${r.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => openEdit(r)} title={`Edit ${r.name}`} aria-label={`Edit ${r.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => duplicate(r)} title={`Duplicate ${r.name}`} aria-label={`Duplicate ${r.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => confirmDelete(r)} title={`Delete ${r.name}`} aria-label={`Delete ${r.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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

      {/* Recipe editor modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'New recipe' : `Edit: ${editing.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            {saveErrors.length > 0 && (
              <div role="alert" className="form-error" style={{ margin: '0 24px' }}>
                <strong>Recipe was not saved. Correct these ingredient units:</strong>
                <ul>
                  {saveErrors.map(error => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 20 }}>
              {/* Left: recipe form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label>Name *</label>
                    <input className="input" value={editing.name} onChange={e => setEditing(r => r && ({ ...r, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Kind</label>
                    <select className="select" value={editing.kind} onChange={e => setEditing(r => r && ({ ...r, kind: e.target.value as Recipe['kind'] }))}>
                      {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>

                {/* Lines */}
                <div>
                  <div className="decorations-section-header" style={{ marginBottom: 8 }}>
                    <div className="decorations-header-left">
                      <span className="material-symbols-outlined ms-18" aria-hidden>format_list_bulleted</span>
                      <h3 className="decorations-header-title">Ingredient lines</h3>
                    </div>
                    <button className="quote-toolbar-btn" onClick={addLine}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>add</span>
                      <span>Add line</span>
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {editing.lines.map((line, li) => {
                      const validUnits = validUnitsForIng(line.ingredient_id);
                      const unitOptions = validUnits.includes(line.unit) ? validUnits : [line.unit, ...validUnits];
                      return (
                        <div key={li} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 64px 32px 32px', gap: 6, alignItems: 'center' }}>
                          <select
                            className="select"
                            style={{ minWidth: 0 }}
                            value={line.ingredient_id ?? ''}
                            onChange={e => {
                              const ingId = e.target.value || null;
                              const newUnits = validUnitsForIng(ingId);
                              updateLine(li, { ingredient_id: ingId, unit: newUnits[0] });
                            }}
                          >
                            <option value="">(free / water)</option>
                            {[...data.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                          </select>
                          <NumberInput value={line.quantity} onChange={v => updateLine(li, { quantity: v })} placeholder="qty" aria-label="Quantity" />
                          <select
                            className="select"
                            style={{ minWidth: 0 }}
                            value={line.unit}
                            onChange={e => updateLine(li, { unit: e.target.value as RecipeLine['unit'] })}
                          >
                            {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <button
                            className="quote-toolbar-btn"
                            onClick={() => updateLine(li, { exclude_from_weight: !line.exclude_from_weight })}
                            title="Exclude from batch weight"
                            aria-label={`${line.exclude_from_weight ? 'Include in' : 'Exclude from'} batch weight`}
                            aria-pressed={Boolean(line.exclude_from_weight)}
                            style={{
                              width: 32,
                              height: 32,
                              padding: 0,
                              ...(line.exclude_from_weight ? {
                                background: 'var(--error-container)',
                                color: 'var(--accent-red)',
                                borderColor: 'var(--accent-red)',
                              } : {}),
                            }}
                          >
                            <span className="material-symbols-outlined ms-16" aria-hidden>scale</span>
                          </button>
                          <button className="quote-toolbar-btn" onClick={() => removeLine(li)} title="Remove line" aria-label="Remove line" style={{ width: 32, height: 32, padding: 0 }}>
                            <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label>Weight adjustment (g)</label>
                  <NumberInput value={editing.weight_adjustment_g} onChange={v => setEditing(r => r && ({ ...r, weight_adjustment_g: v }))} allowNeg />
                  <span className="input-hint">Extra grams to add to batch weight (e.g. water, typed constants)</span>
                </div>

                <div className="form-group">
                  <label htmlFor="recipe-waste-pct">Waste / spoilage (%)</label>
                  <NumberInput
                    id="recipe-waste-pct"
                    value={displayWastePercent(editing.waste_pct)}
                    onChange={v => setEditing(r => r && ({ ...r, waste_pct: v / 100 }))}
                    step={0.1}
                    aria-label="Waste / spoilage percentage"
                  />
                  <span className="input-hint">
                    Applied to raw ingredient cost before overhead. Use for trim loss, evaporation, or spoilage. Recipe and product waste are separate, multiplicative loss events (3% + 5% = ×1.03 ×1.05).
                  </span>
                  {(editing.waste_pct ?? 0) >= 0.5 && (
                    <span className="text-red" role="status">High waste / spoilage (50% or more)</span>
                  )}
                </div>

                <div className="form-group">
                  <label>Labour hours per batch</label>
                  <NumberInput
                    value={editing.labour_hours ?? 0}
                    onChange={v => setEditing(r => r && ({ ...r, labour_hours: v }))}
                    step={0.25}
                  />
                  <span className="input-hint">
                    Hands-on time to make one batch (informational only — labour is charged on the Quote page)
                  </span>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <input className="input" value={editing.notes ?? ''} onChange={e => setEditing(r => r && ({ ...r, notes: e.target.value }))} />
                </div>
              </div>

              {/* Right: live results */}
              <div>
                <div className="quote-section-card" style={{ position: 'sticky', top: 0 }}>
                  <div className="decorations-section-header">
                    <div className="decorations-header-left">
                      <span className="material-symbols-outlined ms-18" aria-hidden>analytics</span>
                      <h3 className="decorations-header-title">Live results</h3>
                    </div>
                  </div>
                  {(() => {
                    // Compute preview with current editing recipe
                    const previewData = { ...data, recipes: [...data.recipes.filter(r => r.id !== editing.id), editing] };
                    const res = compute(previewData).recipes[editing.id];
                    if (!res) return <div className="text-muted text-sm">Add lines to see results</div>;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                        <div className="result-row"><span className="text-secondary">Raw cost</span><span className="td-mono">{fmtMoney(res.raw, cur)}</span></div>
                        {(editing.waste_pct ?? 0) > 0 && (
                          <div className="result-row">
                            <span className="text-secondary">Waste adjustment</span>
                            <span className="td-mono">{fmtMoney(res.raw_after_waste - res.raw, cur)}</span>
                          </div>
                        )}
                        <div className="result-row"><span className="text-secondary">CWO (+{(data.settings.overhead_pct * 100).toFixed(0)}%)</span><span className="td-mono text-green">{fmtMoney(res.cwo, cur)}</span></div>
                        <div className="result-row"><span className="text-secondary">Batch weight</span><span className="td-mono">{res.weight.toFixed(0)}g</span></div>
                        <div className="result-row"><span className="text-secondary">Per gram</span><span className="td-mono">{fmtMoney(res.per_gram_cwo, cur, 4)}</span></div>
                        {editing.kind === 'cake' && <div className="result-row"><span className="text-secondary">Cake cost/kg</span><span className="td-mono text-green">{fmtMoney(res.cake_cost_per_kg, cur, 4)}</span></div>}
                        {editing.kind === 'frosting_filling' && <div className="result-row"><span className="text-secondary">Frosting/kg cake</span><span className="td-mono text-green">{fmtMoney(res.frosting_cost_per_kg_cake, cur, 4)}</span></div>}
                        {res.warnings.length > 0 && <WarningsList warnings={res.warnings} limit={3} />}
                      </div>
                    );
                  })()}
                </div>
                {nutrition && allergens && (
                  <section className="quote-section-card recipe-nutrition-panel" aria-label="Nutrition estimate and allergens">
                    <div className="decorations-section-header">
                      <div className="decorations-header-left">
                        <span className="material-symbols-outlined ms-18" aria-hidden>vital_signs</span>
                        <h3 className="decorations-header-title">Nutrition estimate</h3>
                      </div>
                    </div>
                    <div className="recipe-nutrition-values">
                      <div>
                        <div className="text-label-caps">Whole batch</div>
                        <div className="result-row"><span>Energy</span><span className="td-mono">{Math.round(nutrition.total.kcal)} kcal</span></div>
                        <div className="result-row"><span>Protein</span><span className="td-mono">{nutrition.total.protein_g.toFixed(1)} g</span></div>
                        <div className="result-row"><span>Fat</span><span className="td-mono">{nutrition.total.fat_g.toFixed(1)} g</span></div>
                        <div className="result-row"><span>Carbohydrates</span><span className="td-mono">{nutrition.total.carbs_g.toFixed(1)} g</span></div>
                        <div className="result-row"><span>Fibre</span><span className="td-mono">{nutrition.total.fibre_g.toFixed(1)} g</span></div>
                        <div className="result-row"><span>Sodium</span><span className="td-mono">{nutrition.total.sodium_mg.toFixed(1)} mg</span></div>
                      </div>
                      <div>
                        <div className="text-label-caps">Per 100 g</div>
                        {nutrition.per_100g ? (
                          <>
                            <div className="result-row"><span>Energy</span><span className="td-mono">{Math.round(nutrition.per_100g.kcal)} kcal</span></div>
                            <div className="result-row"><span>Protein</span><span className="td-mono">{nutrition.per_100g.protein_g.toFixed(1)} g</span></div>
                            <div className="result-row"><span>Fat</span><span className="td-mono">{nutrition.per_100g.fat_g.toFixed(1)} g</span></div>
                            <div className="result-row"><span>Carbohydrates</span><span className="td-mono">{nutrition.per_100g.carbs_g.toFixed(1)} g</span></div>
                            <div className="result-row"><span>Fibre</span><span className="td-mono">{nutrition.per_100g.fibre_g.toFixed(1)} g</span></div>
                            <div className="result-row"><span>Sodium</span><span className="td-mono">{nutrition.per_100g.sodium_mg.toFixed(1)} mg</span></div>
                          </>
                        ) : <div className="text-muted text-sm">Recipe weight is needed for per-100 g values.</div>}
                      </div>
                    </div>
                    <div className="text-label-caps recipe-allergen-heading">Allergens</div>
                    {allergens.allergens.length > 0
                      ? <div className="recipe-allergen-chips">{allergens.allergens.map(allergen => <span className="badge badge-amber" key={allergen}>{allergen}</span>)}</div>
                      : <div className="text-muted text-sm">No allergen codes recorded for the ingredients in this recipe.</div>}
                    <p className="recipe-nutrition-disclaimer">
                      Approximate. Based only on ingredients with nutrition data entered. Verify before customer-facing use.
                    </p>
                    {[...nutrition.warnings, ...allergens.warnings].length > 0 && (
                      <WarningsList warnings={[...nutrition.warnings, ...allergens.warnings]} limit={4} />
                    )}
                  </section>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={save} disabled={!editing.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save recipe</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {explainTarget && result.recipes[explainTarget.id] && (
        <ExplainPanel
          title={explainTarget.name}
          audit={result.recipes[explainTarget.id].audit}
          currency={cur}
          onClose={() => setExplainTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete recipe "${deleteTarget.name}"?`}
          onConfirm={() => { dispatch({ type: 'DELETE_RECIPE', id: deleteTarget!.id }); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
          danger
        />
      )}
    </div>
  );
}
