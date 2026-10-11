import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { BatchProduct, AssembledProduct, AssembledComponent } from '../../engine/types';
import { compute } from '../../engine/engine';
import { NumberInput, SearchBar, ConfirmDialog, Toggle, fmtMoney } from '../components/Shared';
import { ExplainPanel } from '../components/ExplainPanel';
import { WarningsList } from '../components/WarningsList';
import { generateId } from '../../engine/utils';

export function ProductsPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [tab, setTab] = useState<'batch' | 'assembled'>('batch');
  const [search, setSearch] = useState('');
  const [editingBatch, setEditingBatch] = useState<BatchProduct | null>(null);
  const [editingAssembled, setEditingAssembled] = useState<AssembledProduct | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'batch' | 'assembled' } | null>(null);
  const [explainBatch, setExplainBatch] = useState<string | null>(null);
  const [explainAssembled, setExplainAssembled] = useState<string | null>(null);

  const [batchMultipliers, setBatchMultipliers] = useState<Record<string, number>>({});

  const result = useMemo(() => compute(data, null, batchMultipliers), [data, batchMultipliers]);
  const filteredBatchProducts = [...data.batch_products]
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filteredAssembledProducts = [...data.assembled_products]
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const batchRecipes = [...data.recipes.filter(r => r.kind === 'batch_product')].sort((a, b) => a.name.localeCompare(b.name));
  const frostingRecipes = [...data.recipes.filter(r => r.kind === 'frosting_filling')].sort((a, b) => a.name.localeCompare(b.name));
  const cakeRecipes = [...data.recipes.filter(r => r.kind === 'cake')].sort((a, b) => a.name.localeCompare(b.name));

  // Batch product CRUD
  const openNewBatch = () => {
    setIsNew(true);
    setEditingBatch({
      id: generateId('batch'),
      name: '',
      recipe_id: batchRecipes[0]?.id ?? '',
      pieces_mode: 'by_weight',
      piece_weight_g: 50,
      labour_hours_per_batch: 0,
      components: [],
      box_id: null,
      pieces_per_box: 12,
      show_each_including_box: true,
    });
  };

  const saveBatch = () => {
    if (!editingBatch || !editingBatch.name.trim()) return;
    if (isNew) dispatch({ type: 'ADD_BATCH_PRODUCT', item: editingBatch });
    else dispatch({ type: 'UPDATE_BATCH_PRODUCT', item: editingBatch });
    setEditingBatch(null);
  };

  const duplicateBatch = (p: BatchProduct) => {
    setIsNew(true);
    setEditingBatch({ ...p, id: generateId('batch'), name: `${p.name} (copy)`, components: p.components.map(c => ({ ...c })) });
  };

  // Assembled product CRUD
  const openNewAssembled = () => {
    setIsNew(true);
    setEditingAssembled({
      id: generateId('assembled'),
      name: '',
      components: [],
      labour_hours_per_batch: 0,
      pieces_per_batch: 12,
      box_id: null,
      pieces_per_box: 12,
    });
  };

  const saveAssembled = () => {
    if (!editingAssembled || !editingAssembled.name.trim()) return;
    if (isNew) dispatch({ type: 'ADD_ASSEMBLED_PRODUCT', item: editingAssembled });
    else dispatch({ type: 'UPDATE_ASSEMBLED_PRODUCT', item: editingAssembled });
    setEditingAssembled(null);
  };

  const duplicateAssembled = (p: AssembledProduct) => {
    setIsNew(true);
    setEditingAssembled({ ...p, id: generateId('assembled'), name: `${p.name} (copy)`, components: p.components.map(c => ({ ...c })) });
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'batch') dispatch({ type: 'DELETE_BATCH_PRODUCT', id: deleteTarget.id });
    else dispatch({ type: 'DELETE_ASSEMBLED_PRODUCT', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  // Assembled component helpers
  const addComponent = (type: AssembledComponent['type']) => {
    if (!editingAssembled) return;
    let comp: AssembledComponent;
    if (type === 'cake_recipe_grams') comp = { type, recipe_id: cakeRecipes[0]?.id ?? '', grams: 60 };
    else if (type === 'recipe_per_gram') comp = { type, recipe_id: frostingRecipes[0]?.id ?? '', grams: 30 };
    else comp = { type: 'ingredient_grams', ingredient_id: data.ingredients[0]?.id ?? '', grams: 10 };
    setEditingAssembled(p => p && ({ ...p, components: [...p.components, comp] }));
  };

  const updateComponent = (idx: number, update: Partial<AssembledComponent>) => {
    setEditingAssembled(p => {
      if (!p) return p;
      const comps = p.components.map((c, i) => i === idx ? { ...c, ...update } : c);
      return { ...p, components: comps as AssembledComponent[] };
    });
  };

  const removeComponent = (idx: number) => {
    setEditingAssembled(p => p && ({ ...p, components: p.components.filter((_, i) => i !== idx) }));
  };

  return (
    <div>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Catalog</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Products</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Products</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button
            className="quote-toolbar-btn quote-toolbar-btn-primary"
            onClick={tab === 'batch' ? openNewBatch : openNewAssembled}
          >
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>{tab === 'batch' ? 'Add batch product' : 'Add assembled product'}</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="tabs" role="tablist" aria-label="Product types">
          <button type="button" role="tab" aria-selected={tab === 'batch'} className={`tab ${tab === 'batch' ? 'active' : ''}`} onClick={() => setTab('batch')}>
            Batch products ({data.batch_products.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'assembled'} className={`tab ${tab === 'assembled' ? 'active' : ''}`} onClick={() => setTab('assembled')}>
            Assembled products ({data.assembled_products.length})
          </button>
        </div>

        {tab === 'batch' && (
          <div className="quote-section-card">
            <div className="decorations-section-header">
              <div className="decorations-header-left">
                <span className="material-symbols-outlined ms-20" aria-hidden>cookie</span>
                <h2 className="decorations-header-title">Batch Products</h2>
              </div>
              <span className="decorations-header-right">{filteredBatchProducts.length} of {data.batch_products.length} products</span>
            </div>
            <SearchBar value={search} onChange={setSearch} placeholder="Search batch products…" maxWidth={420} />
            {filteredBatchProducts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <span className="material-symbols-outlined ms-32" aria-hidden>cookie</span>
                </div>
                <div className="empty-state-title">{search ? 'No batch products found' : 'No batch products yet'}</div>
                <div className="empty-state-text">{search ? 'Try a different search term' : 'Add a batch product to get started'}</div>
                <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNewBatch}>
                  <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                  <span>Add batch product</span>
                </button>
              </div>
            ) : (
              <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pieces</th>
                    <th>Unit Cost</th>
                    <th>Each (Excl Box)</th>
                    <th>Each (Incl Box)</th>
                    <th>Box Price</th>
                    <th>Headline</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatchProducts.map(p => {
                    const res = result.batch_products[p.id];
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                        </td>
                        <td className="td-mono">{res?.pieces.toFixed(2) ?? '—'}</td>
                        <td className="td-mono">{res ? fmtMoney(res.unit_cost, cur, 4) : '—'}</td>
                        <td className="td-mono">{res ? fmtMoney(res.each_excluding_box, cur, 4) : '—'}</td>
                        <td className="td-mono">{res ? fmtMoney(res.each_including_box, cur, 4) : '—'}</td>
                        <td className="td-mono text-green">{res ? fmtMoney(res.box_price, cur) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <span className="badge badge-accent">
                              {res ? fmtMoney(res.headline_each, cur) : '—'}
                            </span>
                            {res?.suggested_headline_each !== undefined && (
                              <span style={{ fontSize: 11, color: 'var(--accent-amber)', whiteSpace: 'nowrap' }}>
                                Sugg: {fmtMoney(res.suggested_headline_each, cur)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="td-actions">
                            {res && <button className="quote-toolbar-btn" onClick={() => setExplainBatch(p.id)} title={`Explain ${p.name}`} aria-label={`Explain ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
                            </button>}
                            <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditingBatch({ ...p }); }} title={`Edit ${p.name}`} aria-label={`Edit ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => duplicateBatch(p)} title={`Duplicate ${p.name}`} aria-label={`Duplicate ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => setDeleteTarget({ id: p.id, name: p.name, type: 'batch' })} title={`Delete ${p.name}`} aria-label={`Delete ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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
        )}

        {tab === 'assembled' && (
          <div className="quote-section-card">
            <div className="decorations-section-header">
              <div className="decorations-header-left">
                <span className="material-symbols-outlined ms-20" aria-hidden>bakery_dining</span>
                <h2 className="decorations-header-title">Assembled Products</h2>
              </div>
              <span className="decorations-header-right">{filteredAssembledProducts.length} of {data.assembled_products.length} products</span>
            </div>
            <SearchBar value={search} onChange={setSearch} placeholder="Search assembled products…" maxWidth={420} />
            {filteredAssembledProducts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <span className="material-symbols-outlined ms-32" aria-hidden>bakery_dining</span>
                </div>
                <div className="empty-state-title">{search ? 'No assembled products found' : 'No assembled products yet'}</div>
                <div className="empty-state-text">{search ? 'Try a different search term' : 'Add an assembled product to get started'}</div>
                <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNewAssembled}>
                  <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                  <span>Add assembled product</span>
                </button>
              </div>
            ) : (
              <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pieces/Batch</th>
                    <th>Unit Cost</th>
                    <th>Labour/Piece</th>
                    <th>Price Each</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssembledProducts.map(p => {
                    const res = result.assembled_products[p.id];
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                        </td>
                        <td className="td-mono">{p.pieces_per_batch}</td>
                        <td className="td-mono">{res ? fmtMoney(res.unit_cost, cur, 4) : '—'}</td>
                        <td className="td-mono">{res ? fmtMoney(res.labour_piece, cur, 4) : '—'}</td>
                        <td className="td-mono">
                          <div className="text-green">{res ? fmtMoney(res.price_each, cur) : '—'}</div>
                          {res?.suggested_price_each !== undefined && (
                            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent-amber)', fontFamily: 'var(--font-body)', textAlign: 'right' }}>
                              Sugg: {fmtMoney(res.suggested_price_each, cur)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="td-actions">
                            {res && <button className="quote-toolbar-btn" onClick={() => setExplainAssembled(p.id)} title={`Explain ${p.name}`} aria-label={`Explain ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
                            </button>}
                            <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditingAssembled({ ...p }); }} title={`Edit ${p.name}`} aria-label={`Edit ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => duplicateAssembled(p)} title={`Duplicate ${p.name}`} aria-label={`Duplicate ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => setDeleteTarget({ id: p.id, name: p.name, type: 'assembled' })} title={`Delete ${p.name}`} aria-label={`Delete ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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
        )}
      </div>

      {/* Batch product editor */}
      {editingBatch && (
        <div className="modal-backdrop" onClick={() => setEditingBatch(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'New batch product' : `Edit: ${editingBatch.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditingBatch(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Name *</label>
                  <input className="input" value={editingBatch.name} onChange={e => setEditingBatch(p => p && ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Recipe</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select className="select" value={editingBatch.recipe_id} onChange={e => setEditingBatch(p => p && ({ ...p, recipe_id: e.target.value }))} style={{ flex: 1 }}>
                      {batchRecipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    {editingBatch.recipe_id && (
                      <div style={{ width: 80 }}>
                        <NumberInput
                          value={batchMultipliers[editingBatch.recipe_id] ?? 1}
                          onChange={v => setBatchMultipliers(s => ({ ...s, [editingBatch.recipe_id]: v }))}
                          min={0} step={0.1} placeholder="Scale"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Pieces mode</label>
                  <select className="select" value={editingBatch.pieces_mode} onChange={e => setEditingBatch(p => p && ({ ...p, pieces_mode: e.target.value as 'by_weight' | 'fixed' }))}>
                    <option value="by_weight">By weight (recipe weight / piece weight)</option>
                    <option value="fixed">Fixed count</option>
                  </select>
                </div>
                {editingBatch.pieces_mode === 'by_weight' && (
                  <div className="form-group">
                    <label>Piece weight (g)</label>
                    <NumberInput value={editingBatch.piece_weight_g ?? 0} onChange={v => setEditingBatch(p => p && ({ ...p, piece_weight_g: v }))} />
                  </div>
                )}
                {editingBatch.pieces_mode === 'fixed' && (
                  <div className="form-group">
                    <label>Fixed pieces</label>
                    <NumberInput value={editingBatch.fixed_pieces ?? 0} onChange={v => setEditingBatch(p => p && ({ ...p, fixed_pieces: v }))} />
                  </div>
                )}
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>Labour hours/batch</label>
                  <NumberInput value={editingBatch.labour_hours_per_batch} onChange={v => setEditingBatch(p => p && ({ ...p, labour_hours_per_batch: v }))} step={0.25} />
                </div>
                <div className="form-group">
                  <label>Box packaging</label>
                  <select className="select" value={editingBatch.box_id ?? ''} onChange={e => setEditingBatch(p => p && ({ ...p, box_id: e.target.value || null }))}>
                    <option value="">— none —</option>
                    {[...data.packaging_items].sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Pieces per box</label>
                  <NumberInput value={editingBatch.pieces_per_box} onChange={v => setEditingBatch(p => p && ({ ...p, pieces_per_box: v }))} />
                </div>
              </div>
              <div className="form-group">
                <Toggle
                  checked={editingBatch.show_each_including_box}
                  onChange={v => setEditingBatch(p => p && ({ ...p, show_each_including_box: v }))}
                  label="Show price per piece including box as headline (vs excluding box)"
                />
              </div>

              {/* Components */}
              <div>
                <div className="decorations-section-header" style={{ marginBottom: 8 }}>
                  <div className="decorations-header-left">
                    <span className="material-symbols-outlined ms-18" aria-hidden>playlist_add</span>
                    <h3 className="decorations-header-title">Extra components per piece</h3>
                  </div>
                  <button className="quote-toolbar-btn" onClick={() => setEditingBatch(p => p && ({ ...p, components: [...p.components, { recipe_id: frostingRecipes[0]?.id ?? '', grams: 15 }] }))}>
                    <span className="material-symbols-outlined ms-16" aria-hidden>add</span>
                    + Component
                  </button>
                </div>
                {editingBatch.components.map((comp, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px 32px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="select" value={comp.recipe_id} onChange={e => {
                        const comps = editingBatch.components.map((c, i) => i === ci ? { ...c, recipe_id: e.target.value } : c);
                        setEditingBatch(p => p && ({ ...p, components: comps }));
                      }} style={{ flex: 1, minWidth: 0 }}>
                        {[...data.recipes].sort((a, b) => a.name.localeCompare(b.name)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {comp.recipe_id && (
                        <div style={{ width: 80 }}>
                          <NumberInput
                            value={batchMultipliers[comp.recipe_id] ?? 1}
                            onChange={v => setBatchMultipliers(s => ({ ...s, [comp.recipe_id]: v }))}
                            min={0} step={0.1} placeholder="Scale"
                          />
                        </div>
                      )}
                    </div>
                    <NumberInput value={comp.grams} onChange={v => {
                      const comps = editingBatch.components.map((c, i) => i === ci ? { ...c, grams: v } : c);
                      setEditingBatch(p => p && ({ ...p, components: comps }));
                    }} placeholder="grams" />
                    <button className="quote-toolbar-btn" onClick={() => setEditingBatch(p => p && ({ ...p, components: p.components.filter((_, i) => i !== ci) }))} title="Remove component" aria-label="Remove component" style={{ width: 32, height: 32, padding: 0 }}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Live result */}
              {(() => {
                const prev = { ...data, batch_products: [...data.batch_products.filter(p => p.id !== editingBatch.id), editingBatch] };
                const res = compute(prev, null, batchMultipliers).batch_products[editingBatch.id];
                if (!res) return null;
                return (
                  <div className="success-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <b>Pieces: {res.pieces.toFixed(2)}</b>
                    <span>Unit cost: {fmtMoney(res.unit_cost, cur, 4)}</span>
                    <span>Each excl. box: {fmtMoney(res.each_excluding_box, cur, 4)}</span>
                    <span>Each incl. box: {fmtMoney(res.each_including_box, cur, 4)}</span>
                    <span>Box (full): {fmtMoney(res.box_price, cur)}</span>
                    {res.warnings.length > 0 && (
                      <div style={{ width: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
                        <WarningsList warnings={res.warnings} limit={3} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditingBatch(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={saveBatch} disabled={!editingBatch.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assembled product editor */}
      {editingAssembled && (
        <div className="modal-backdrop" onClick={() => setEditingAssembled(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'New assembled product' : `Edit: ${editingAssembled.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditingAssembled(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="input" value={editingAssembled.name} onChange={e => setEditingAssembled(p => p && ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>Labour hours/batch</label>
                  <NumberInput value={editingAssembled.labour_hours_per_batch} onChange={v => setEditingAssembled(p => p && ({ ...p, labour_hours_per_batch: v }))} step={0.25} />
                </div>
                <div className="form-group">
                  <label>Pieces per batch</label>
                  <NumberInput value={editingAssembled.pieces_per_batch} onChange={v => setEditingAssembled(p => p && ({ ...p, pieces_per_batch: v }))} />
                </div>
                <div className="form-group">
                  <label>Box</label>
                  <select className="select" value={editingAssembled.box_id ?? ''} onChange={e => setEditingAssembled(p => p && ({ ...p, box_id: e.target.value || null }))}>
                    <option value="">— none —</option>
                    {[...data.packaging_items].sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Pieces per box</label>
                <NumberInput value={editingAssembled.pieces_per_box} onChange={v => setEditingAssembled(p => p && ({ ...p, pieces_per_box: v }))} />
              </div>

              {/* Components */}
              <div>
                <div className="decorations-section-header" style={{ marginBottom: 8 }}>
                  <div className="decorations-header-left">
                    <span className="material-symbols-outlined ms-18" aria-hidden>playlist_add</span>
                    <h3 className="decorations-header-title">Components</h3>
                  </div>
                  <div className="quote-toolbar">
                    <button className="quote-toolbar-btn" onClick={() => addComponent('cake_recipe_grams')}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>cake</span>
                      <span>Cake grams</span>
                    </button>
                    <button className="quote-toolbar-btn" onClick={() => addComponent('recipe_per_gram')}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>bakery_dining</span>
                      <span>Recipe/gram</span>
                    </button>
                    <button className="quote-toolbar-btn" onClick={() => addComponent('ingredient_grams')}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>grocery</span>
                      <span>Ingredient</span>
                    </button>
                  </div>
                </div>
                {editingAssembled.components.map((comp, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span className="badge badge-muted" style={{ fontSize: 11 }}>
                      <span className="material-symbols-outlined ms-14" aria-hidden>
                        {comp.type === 'cake_recipe_grams' ? 'cake' : comp.type === 'recipe_per_gram' ? 'bakery_dining' : 'grocery'}
                      </span>
                      {comp.type === 'cake_recipe_grams' ? 'Cake' : comp.type === 'recipe_per_gram' ? 'Recipe' : 'Ingredient'}
                    </span>
                    <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
                      <select className="select" value={comp.type === 'ingredient_grams' ? comp.ingredient_id : comp.recipe_id} onChange={e => {
                        if (comp.type === 'ingredient_grams') updateComponent(ci, { ingredient_id: e.target.value } as Partial<AssembledComponent>);
                        else updateComponent(ci, { recipe_id: e.target.value } as Partial<AssembledComponent>);
                      }} style={{ flex: 1, minWidth: 0 }}>
                        {comp.type === 'ingredient_grams'
                          ? [...data.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                          : (comp.type === 'cake_recipe_grams' ? cakeRecipes : frostingRecipes).map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                        }
                      </select>
                      {comp.type !== 'ingredient_grams' && comp.recipe_id && (
                        <div style={{ width: 64, flexShrink: 0 }}>
                          <NumberInput
                            value={batchMultipliers[comp.recipe_id] ?? 1}
                            onChange={v => setBatchMultipliers(s => ({ ...s, [comp.recipe_id]: v }))}
                            min={0} step={0.1} placeholder="Scale"
                          />
                        </div>
                      )}
                    </div>
                    <NumberInput value={comp.grams} onChange={v => updateComponent(ci, { grams: v } as Partial<AssembledComponent>)} placeholder="g" />
                    <button className="quote-toolbar-btn" onClick={() => removeComponent(ci)} title="Remove component" aria-label="Remove component" style={{ width: 32, height: 32, padding: 0 }}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Live result */}
              {(() => {
                const prev = { ...data, assembled_products: [...data.assembled_products.filter(p => p.id !== editingAssembled.id), editingAssembled] };
                const res = compute(prev, null, batchMultipliers).assembled_products[editingAssembled.id];
                if (!res) return null;
                return (
                  <div className="success-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span>Unit cost: {fmtMoney(res.unit_cost, cur, 4)}</span>
                    <span>Labour/piece: {fmtMoney(res.labour_piece, cur, 4)}</span>
                    <span>Box/piece: {fmtMoney(res.box_piece, cur, 4)}</span>
                    <b>Price each: {fmtMoney(res.price_each, cur)}</b>
                    {res.suggested_price_each !== undefined && (
                      <span style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
                        Suggested: {fmtMoney(res.suggested_price_each, cur)}
                      </span>
                    )}
                    {res.warnings.length > 0 && (
                      <div style={{ width: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
                        <WarningsList warnings={res.warnings} limit={3} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditingAssembled(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={saveAssembled} disabled={!editingAssembled.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {explainBatch && result.batch_products[explainBatch] && (
        <ExplainPanel
          title={data.batch_products.find(p => p.id === explainBatch)?.name ?? explainBatch}
          audit={result.batch_products[explainBatch].audit}
          currency={cur}
          onClose={() => setExplainBatch(null)}
        />
      )}

      {explainAssembled && result.assembled_products[explainAssembled] && (
        <ExplainPanel
          title={data.assembled_products.find(p => p.id === explainAssembled)?.name ?? explainAssembled}
          audit={result.assembled_products[explainAssembled].audit}
          currency={cur}
          onClose={() => setExplainAssembled(null)}
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
