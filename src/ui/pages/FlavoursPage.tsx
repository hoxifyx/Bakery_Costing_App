import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Flavour, Filling } from '../../engine/types';
import { compute } from '../../engine/engine';
import { NumberInput, SearchBar, ConfirmDialog, fmtMoney } from '../components/Shared';
import { ExplainPanel } from '../components/ExplainPanel';
import { generateId } from '../../engine/utils';
import { getFillingUsedIn } from '../quoteReferences';

export function FlavoursPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [tab, setTab] = useState<'flavours' | 'fillings'>('flavours');
  const [search, setSearch] = useState('');
  const [editingFlavour, setEditingFlavour] = useState<Flavour | null>(null);
  const [editingFilling, setEditingFilling] = useState<Filling | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'flavour' | 'filling' } | null>(null);
  const [explainFlavour, setExplainFlavour] = useState<string | null>(null);
  const [explainFilling, setExplainFilling] = useState<string | null>(null);

  const [batchMultipliers, setBatchMultipliers] = useState<Record<string, number>>({});

  const result = useMemo(() => compute(data, null, batchMultipliers), [data, batchMultipliers]);

  const cakeRecipes = [...data.recipes.filter(r => r.kind === 'cake')].sort((a, b) => a.name.localeCompare(b.name));
  const frostingRecipes = [...data.recipes.filter(r => r.kind === 'frosting_filling')].sort((a, b) => a.name.localeCompare(b.name));
  const filteredFlavours = [...data.flavours]
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filteredFillings = [...data.fillings]
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ---- Flavours ----
  const openNewFlavour = () => {
    setIsNew(true);
    setEditingFlavour({
      id: generateId('flavour'),
      name: '',
      cost_model: { type: 'recipe', cake_recipe_id: cakeRecipes[0]?.id ?? '', frosting_recipe_id: frostingRecipes[0]?.id ?? '' },
      addon_cost_per_kg: 0,
    });
  };

  const saveFlavour = () => {
    if (!editingFlavour || !editingFlavour.name.trim()) return;
    if (isNew) dispatch({ type: 'ADD_FLAVOUR', item: editingFlavour });
    else dispatch({ type: 'UPDATE_FLAVOUR', item: editingFlavour });
    setEditingFlavour(null);
  };

  const duplicateFlavour = (f: Flavour) => {
    setIsNew(true);
    setEditingFlavour({ ...f, id: generateId('flavour'), name: `${f.name} (copy)` });
  };

  const getFlavourUsedIn = (id: string) => {
    const used: string[] = [];
    for (const f of data.flavours) {
      if (f.cost_model.type === 'average' && f.cost_model.of.includes(id)) used.push(`Flavour: ${f.name}`);
    }
    return used;
  };

  const deleteFlavour = (f: Flavour) => {
    const used = getFlavourUsedIn(f.id);
    if (used.length > 0) { alert(`Cannot delete "${f.name}":\n${used.join('\n')}`); return; }
    setDeleteTarget({ id: f.id, name: f.name, type: 'flavour' });
  };

  // ---- Fillings ----
  const openNewFilling = () => {
    setIsNew(true);
    setEditingFilling({
      id: generateId('filling'),
      name: '',
      source: { type: 'recipe', recipe_id: frostingRecipes[0]?.id ?? '' },
    });
  };

  const saveFilling = () => {
    if (!editingFilling || !editingFilling.name.trim()) return;
    if (isNew) dispatch({ type: 'ADD_FILLING', item: editingFilling });
    else dispatch({ type: 'UPDATE_FILLING', item: editingFilling });
    setEditingFilling(null);
  };

  const duplicateFilling = (f: Filling) => {
    setIsNew(true);
    setEditingFilling({ ...f, id: generateId('filling'), name: `${f.name} (copy)` });
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'flavour') dispatch({ type: 'DELETE_FLAVOUR', id: deleteTarget.id });
    else {
      const filling = data.fillings.find(item => item.id === deleteTarget.id);
      const usedIn = getFillingUsedIn(deleteTarget.id, data.saved_quotes);
      if (filling && usedIn.length > 0) {
        alert(`Cannot delete "${filling.name}" — used in saved quotes:\n${usedIn.map(quote => quote.name).join('\n')}`);
        setDeleteTarget(null);
        return;
      }
      dispatch({ type: 'DELETE_FILLING', id: deleteTarget.id });
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Catalog</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Flavours &amp; Fillings</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Flavours &amp; Fillings</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button
            className="quote-toolbar-btn quote-toolbar-btn-primary"
            onClick={tab === 'flavours' ? openNewFlavour : openNewFilling}
          >
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>{tab === 'flavours' ? 'Add flavour' : 'Add filling'}</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="tabs" role="tablist" aria-label="Flavour and filling types">
          <button type="button" role="tab" aria-selected={tab === 'flavours'} className={`tab ${tab === 'flavours' ? 'active' : ''}`} onClick={() => setTab('flavours')}>
            Flavours ({data.flavours.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'fillings'} className={`tab ${tab === 'fillings' ? 'active' : ''}`} onClick={() => setTab('fillings')}>
            Fillings ({data.fillings.length})
          </button>
        </div>

        {tab === 'flavours' && (
          <>
            <div className="quote-section-card">
              <div className="decorations-section-header">
                <div className="decorations-header-left">
                  <span className="material-symbols-outlined ms-20" aria-hidden>bakery_dining</span>
                  <h2 className="decorations-header-title">Flavour Profiles</h2>
                </div>
                <span className="decorations-header-right">{filteredFlavours.length} of {data.flavours.length} flavours</span>
              </div>
              <SearchBar value={search} onChange={setSearch} placeholder="Search flavours…" maxWidth={420} />
              {filteredFlavours.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <span className="material-symbols-outlined ms-32" aria-hidden>bakery_dining</span>
                  </div>
                  <div className="empty-state-title">{search ? 'No flavours found' : 'No flavours yet'}</div>
                  <div className="empty-state-text">{search ? 'Try a different search term' : 'Add a flavour profile to get started'}</div>
                  <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNewFlavour}>
                    <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                    <span>Add flavour</span>
                  </button>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Base Price / Kg</th>
                        <th>Add-on (w/OH)</th>
                        <th>Total Price / Kg</th>
                        <th>Warnings</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFlavours.map(f => {
                        const res = result.flavours[f.id];
                        const addonWithOH = f.addon_cost_per_kg * (1 + data.settings.overhead_pct);
                        return (
                          <tr key={f.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{f.name}</div>
                              <div className="text-muted" style={{ fontSize: 11 }}>{f.id}</div>
                            </td>
                            <td>
                              <span className="badge badge-muted">
                                <span className="material-symbols-outlined ms-14" aria-hidden>
                                  {f.cost_model.type === 'recipe' ? 'menu_book' : 'calculate'}
                                </span>
                                {f.cost_model.type === 'recipe' ? 'Recipe' : 'Average'}
                              </span>
                            </td>
                            <td className="td-mono">{res ? fmtMoney(res.base, cur, 4) : '—'}</td>
                            <td className="td-mono">{fmtMoney(addonWithOH, cur, 4)}</td>
                            <td className="td-mono text-green">{res ? fmtMoney(res.price_per_kg, cur, 4) : '—'}</td>
                            <td>
                              {res?.warnings.length
                                ? <span className="badge badge-amber"><span className="material-symbols-outlined ms-14" aria-hidden>warning</span>{res.warnings.length}</span>
                                : <span className="badge badge-green"><span className="material-symbols-outlined ms-14" aria-hidden>check_circle</span></span>}
                            </td>
                            <td>
                              <div className="td-actions">
                                {res && (
                                  <button className="quote-toolbar-btn" onClick={() => setExplainFlavour(f.id)} title={`Explain ${f.name}`} aria-label={`Explain ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                    <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
                                  </button>
                                )}
                                <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditingFlavour({ ...f }); }} title={`Edit ${f.name}`} aria-label={`Edit ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                  <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                                </button>
                                <button className="quote-toolbar-btn" onClick={() => duplicateFlavour(f)} title={`Duplicate ${f.name}`} aria-label={`Duplicate ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                  <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                                </button>
                                <button className="quote-toolbar-btn" onClick={() => deleteFlavour(f)} title={`Delete ${f.name}`} aria-label={`Delete ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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
          </>
        )}

        {tab === 'fillings' && (
          <>
            <div className="quote-section-card">
              <div className="decorations-section-header">
                <div className="decorations-header-left">
                  <span className="material-symbols-outlined ms-20" aria-hidden>liquor</span>
                  <h2 className="decorations-header-title">Fillings &amp; Curds</h2>
                </div>
                <span className="decorations-header-right">{filteredFillings.length} of {data.fillings.length} fillings</span>
              </div>
              <SearchBar value={search} onChange={setSearch} placeholder="Search fillings…" maxWidth={420} />
              {filteredFillings.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <span className="material-symbols-outlined ms-32" aria-hidden>liquor</span>
                  </div>
                  <div className="empty-state-title">{search ? 'No fillings found' : 'No fillings yet'}</div>
                  <div className="empty-state-text">{search ? 'Try a different search term' : 'Add a filling to get started'}</div>
                  <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNewFilling}>
                    <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                    <span>Add filling</span>
                  </button>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Source</th>
                        <th>Cost / Kg of Cake</th>
                        <th>Warnings</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFillings.map(f => {
                        const res = result.fillings[f.id];
                        return (
                          <tr key={f.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{f.name}</div>
                              <div className="text-muted" style={{ fontSize: 11 }}>{f.id}</div>
                            </td>
                            <td>
                              <span className="badge badge-muted">
                                <span className="material-symbols-outlined ms-14" aria-hidden>
                                  {f.source.type === 'recipe' ? 'menu_book' : 'grocery'}
                                </span>
                                {f.source.type === 'recipe' ? 'Recipe' : 'Ingredient'}
                              </span>
                            </td>
                            <td className="td-mono text-green">{res ? fmtMoney(res.cost_per_kg, cur, 4) : '—'}</td>
                            <td>
                              {res?.warnings.length
                                ? <span className="badge badge-amber"><span className="material-symbols-outlined ms-14" aria-hidden>warning</span>{res.warnings.length}</span>
                                : <span className="badge badge-green"><span className="material-symbols-outlined ms-14" aria-hidden>check_circle</span></span>}
                            </td>
                            <td>
                              <div className="td-actions">
                                {res && (
                                  <button className="quote-toolbar-btn" onClick={() => setExplainFilling(f.id)} title={`Explain ${f.name}`} aria-label={`Explain ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                    <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
                                  </button>
                                )}
                                <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditingFilling({ ...f }); }} title={`Edit ${f.name}`} aria-label={`Edit ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                  <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                                </button>
                                <button className="quote-toolbar-btn" onClick={() => duplicateFilling(f)} title={`Duplicate ${f.name}`} aria-label={`Duplicate ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                                  <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                                </button>
                                <button className="quote-toolbar-btn" onClick={() => setDeleteTarget({ id: f.id, name: f.name, type: 'filling' })} title={`Delete ${f.name}`} aria-label={`Delete ${f.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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
          </>
        )}
      </div>

      {/* Flavour editor */}
      {editingFlavour && (
        <div className="modal-backdrop" onClick={() => setEditingFlavour(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'Add flavour' : `Edit: ${editingFlavour.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditingFlavour(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="input" value={editingFlavour.name} onChange={e => setEditingFlavour(f => f && ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Cost model</label>
                <select
                  className="select"
                  value={editingFlavour.cost_model.type}
                  onChange={e => {
                    const t = e.target.value as 'recipe' | 'average';
                    setEditingFlavour(f => f && ({
                      ...f,
                      cost_model: t === 'recipe'
                        ? { type: 'recipe', cake_recipe_id: cakeRecipes[0]?.id ?? '', frosting_recipe_id: frostingRecipes[0]?.id ?? '' }
                        : { type: 'average', of: [] },
                    }));
                  }}
                >
                  <option value="recipe">Recipe (cake + frosting)</option>
                  <option value="average">Average of other flavours (marble-type)</option>
                </select>
              </div>

              {editingFlavour.cost_model.type === 'recipe' && (
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label>Cake recipe</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="select" value={editingFlavour.cost_model.cake_recipe_id} onChange={e => setEditingFlavour(f => f && ({ ...f, cost_model: { ...f.cost_model as { type: 'recipe'; cake_recipe_id: string; frosting_recipe_id: string }, cake_recipe_id: e.target.value } }))} style={{ flex: 1 }}>
                        <option value="">— none —</option>
                        {cakeRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {editingFlavour.cost_model.cake_recipe_id && (
                        <div style={{ width: 80 }}>
                          <NumberInput value={batchMultipliers[(editingFlavour.cost_model as any).cake_recipe_id] ?? 1} onChange={v => setBatchMultipliers(s => ({ ...s, [(editingFlavour.cost_model as any).cake_recipe_id]: v }))} min={0} step={0.1} placeholder="×" aria-label="Batch multiplier (preview only, not stored)" title="Batch multiplier (preview only, not stored)" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Frosting recipe</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="select" value={editingFlavour.cost_model.frosting_recipe_id} onChange={e => setEditingFlavour(f => f && ({ ...f, cost_model: { ...f.cost_model as { type: 'recipe'; cake_recipe_id: string; frosting_recipe_id: string }, frosting_recipe_id: e.target.value } }))} style={{ flex: 1 }}>
                        <option value="">— none —</option>
                        {frostingRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {editingFlavour.cost_model.frosting_recipe_id && (
                        <div style={{ width: 80 }}>
                          <NumberInput value={batchMultipliers[(editingFlavour.cost_model as any).frosting_recipe_id] ?? 1} onChange={v => setBatchMultipliers(s => ({ ...s, [(editingFlavour.cost_model as any).frosting_recipe_id]: v }))} min={0} step={0.1} placeholder="×" aria-label="Batch multiplier (preview only, not stored)" title="Batch multiplier (preview only, not stored)" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editingFlavour.cost_model.type === 'average' && (
                <div className="form-group">
                  <label>Average of flavours (recipe-type only)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...data.flavours].filter(f => f.cost_model.type === 'recipe' && f.id !== editingFlavour.id).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                      const cm = editingFlavour.cost_model as { type: 'average'; of: string[] };
                      const checked = cm.of.includes(f.id);
                      return (
                        <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setEditingFlavour(ef => {
                              if (!ef) return ef;
                              const cm = ef.cost_model as { type: 'average'; of: string[] };
                              const of = checked ? cm.of.filter(x => x !== f.id) : [...cm.of, f.id];
                              return { ...ef, cost_model: { type: 'average', of } };
                            })}
                          />
                          {f.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Add-on cost per kg ({cur}) — plain ingredient cost</label>
                <NumberInput value={editingFlavour.addon_cost_per_kg} onChange={v => setEditingFlavour(f => f && ({ ...f, addon_cost_per_kg: v }))} step={1} />
                <span className="input-hint">Overhead ({(data.settings.overhead_pct * 100).toFixed(0)}%) is added automatically to this amount</span>
              </div>

              {/* Live preview */}
              {(() => {
                const previewData = { ...data, flavours: [...data.flavours.filter(f => f.id !== editingFlavour.id), editingFlavour] };
                const res = compute(previewData, null, batchMultipliers).flavours[editingFlavour.id];
                if (!res) return null;
                return (
                  <div className="success-banner">
                    Price per kg: {fmtMoney(res.price_per_kg, cur, 4)}
                    (base {fmtMoney(res.base, cur, 4)} + addon {fmtMoney(editingFlavour.addon_cost_per_kg * (1 + data.settings.overhead_pct), cur, 4)})
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditingFlavour(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={saveFlavour} disabled={!editingFlavour.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filling editor */}
      {editingFilling && (
        <div className="modal-backdrop" onClick={() => setEditingFilling(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'Add filling' : `Edit: ${editingFilling.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditingFilling(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="input" value={editingFilling.name} onChange={e => setEditingFilling(f => f && ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Source type</label>
                <select
                  className="select"
                  value={editingFilling.source.type}
                  onChange={e => setEditingFilling(f => f && ({
                    ...f,
                    source: e.target.value === 'recipe'
                      ? { type: 'recipe', recipe_id: frostingRecipes[0]?.id ?? '' }
                      : { type: 'ingredient', ingredient_id: data.ingredients.find(i => i.unit_type === 'g')?.id ?? '' },
                  }))}
                >
                  <option value="recipe">Recipe (frosting/filling kind)</option>
                  <option value="ingredient">Bought ingredient (jam, spreads …)</option>
                </select>
              </div>
              {editingFilling.source.type === 'recipe' && (
                <div className="form-group">
                  <label>Recipe</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select className="select" value={editingFilling.source.recipe_id} onChange={e => setEditingFilling(f => f && ({ ...f, source: { type: 'recipe', recipe_id: e.target.value } }))} style={{ flex: 1 }}>
                      {frostingRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    {editingFilling.source.recipe_id && (
                      <div style={{ width: 80 }}>
                        <NumberInput value={batchMultipliers[(editingFilling.source as any).recipe_id] ?? 1} onChange={v => setBatchMultipliers(s => ({ ...s, [(editingFilling.source as any).recipe_id]: v }))} min={0} step={0.1} placeholder="×" aria-label="Batch multiplier (preview only, not stored)" title="Batch multiplier (preview only, not stored)" />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {editingFilling.source.type === 'ingredient' && (
                <div className="form-group">
                  <label>Ingredient (priced per gram)</label>
                  <select className="select" value={editingFilling.source.ingredient_id} onChange={e => setEditingFilling(f => f && ({ ...f, source: { type: 'ingredient', ingredient_id: e.target.value } }))}>
                    {[...data.ingredients.filter(i => i.unit_type === 'g')].sort((a, b) => a.name.localeCompare(b.name)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              )}
              {/* Live preview */}
              {(() => {
                const previewData = { ...data, fillings: [...data.fillings.filter(f => f.id !== editingFilling.id), editingFilling] };
                const res = compute(previewData, null, batchMultipliers).fillings[editingFilling.id];
                if (!res) return null;
                return (
                  <div className="success-banner">
                    Cost per kg of cake: {fmtMoney(res.cost_per_kg, cur, 4)}
                    {' '}(at {data.settings.filling_grams_per_kg}g/kg)
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditingFilling(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={saveFilling} disabled={!editingFilling.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {explainFlavour && result.flavours[explainFlavour] && (
        <ExplainPanel
          title={data.flavours.find(f => f.id === explainFlavour)?.name ?? explainFlavour}
          audit={result.flavours[explainFlavour].audit}
          currency={cur}
          onClose={() => setExplainFlavour(null)}
        />
      )}

      {explainFilling && result.fillings[explainFilling] && (
        <ExplainPanel
          title={data.fillings.find(f => f.id === explainFilling)?.name ?? explainFilling}
          audit={result.fillings[explainFilling].audit}
          currency={cur}
          onClose={() => setExplainFilling(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"?`}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
          danger
        />
      )}
    </div>
  );
}
