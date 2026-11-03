import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { BatchProduct, AssembledProduct, AssembledComponent } from '../../engine/types';
import { compute } from '../../engine/engine';
import { NumberInput, SearchBar, ConfirmDialog, Toggle, fmtMoney, ComponentRow } from '../components/Shared';
import { ExplainPanel } from '../components/ExplainPanel';
import { WarningsList } from '../components/WarningsList';
import { generateId } from '../../engine/utils';
import { parsePercentToFraction, validatePricingOverrides } from '../productPricing';
import { displayWastePercent } from '../utils';

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
  const [showBatchOverrides, setShowBatchOverrides] = useState(false);
  const [showAssembledOverrides, setShowAssembledOverrides] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const [batchMultipliers, setBatchMultipliers] = useState<Record<string, number>>({});

  const result = useMemo(() => compute(data, null, batchMultipliers), [data, batchMultipliers]);
  const filteredBatchProducts = [...data.batch_products]
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const filteredAssembledProducts = [...data.assembled_products]
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allRecipesSorted = [...data.recipes].sort((a, b) => a.name.localeCompare(b.name));
  const frostingRecipes = allRecipesSorted.filter(r => r.kind === 'frosting_filling');
  const gramIngredients = [...data.ingredients]
    .filter(ing => ing.unit_type === 'g')
    .sort((a, b) => a.name.localeCompare(b.name));

  // Batch product CRUD
  const openNewBatch = () => {
    setIsNew(true);
    setEditingBatch({
      id: generateId('batch'),
      name: '',
      recipe_id: allRecipesSorted[0]?.id ?? '',
      pieces_mode: 'by_weight',
      piece_weight_g: 50,
      labour_hours_per_batch: 0,
      components: [],
      box_id: null,
      pieces_per_box: 12,
      show_each_including_box: true,
      overhead_pct: null,
      target_margin: null,
      labour_rate_per_hour: null,
      other_cost_per_piece: 0,
      waste_pct: 0,
      my_price_each: null,
      my_price_box: null,
    });
  };

  const saveBatch = () => {
    if (!editingBatch || !editingBatch.name.trim()) return;
    const error = validatePricingOverrides(
      editingBatch.overhead_pct,
      editingBatch.target_margin,
      editingBatch.labour_rate_per_hour,
    );
    if (error) {
      setOverrideError(error);
      setShowBatchOverrides(true);
      return;
    }
    setOverrideError(null);
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
      overhead_pct: null,
      target_margin: null,
      labour_rate_per_hour: null,
      other_cost_per_piece: 0,
      waste_pct: 0,
      my_price_each: null,
    });
  };

  const saveAssembled = () => {
    if (!editingAssembled || !editingAssembled.name.trim()) return;
    const error = validatePricingOverrides(
      editingAssembled.overhead_pct,
      editingAssembled.target_margin,
      editingAssembled.labour_rate_per_hour,
    );
    if (error) {
      setOverrideError(error);
      setShowAssembledOverrides(true);
      return;
    }
    setOverrideError(null);
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
    const productKind = deleteTarget.type;
    const references = data.saved_quotes.filter(quote =>
      quote.product_quote_input?.lines?.some(line =>
        line.product_kind === productKind && line.product_id === deleteTarget.id,
      ),
    );
    if (references.length > 0) {
      alert(`Cannot delete "${deleteTarget.name}" — used in saved quotes:\n${references.map(quote => quote.name).join('\n')}`);
      setDeleteTarget(null);
      return;
    }
    if (deleteTarget.type === 'batch') dispatch({ type: 'DELETE_BATCH_PRODUCT', id: deleteTarget.id });
    else dispatch({ type: 'DELETE_ASSEMBLED_PRODUCT', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  // Assembled component helpers
  const addComponent = (type: AssembledComponent['type']) => {
    if (!editingAssembled) return;
    let comp: AssembledComponent;
    if (type === 'cake_recipe_grams') comp = { type, recipe_id: allRecipesSorted[0]?.id ?? '', grams: 60 };
    else if (type === 'recipe_per_gram') comp = { type, recipe_id: allRecipesSorted[0]?.id ?? '', grams: 30 };
    else comp = { type: 'ingredient_grams', ingredient_id: gramIngredients[0]?.id ?? '', grams: 10 };
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
                    <th>My Price</th>
                    <th>Profit Each</th>
                    <th>Margin</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatchProducts.map(p => {
                    const res = result.batch_products[p.id];
                    const targetMargin = p.target_margin ?? data.settings.target_margin;
                    const marginEach = res?.margin_each;
                    const profitEach = res?.profit_each;
                    const hasMyPrice = p.my_price_each !== undefined && p.my_price_each !== null;
                    const isBelowCost = hasMyPrice && profitEach !== undefined && profitEach < 0;
                    const isBelowTarget = hasMyPrice && !isBelowCost && marginEach !== undefined && marginEach < targetMargin;

                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                          {(p.waste_pct ?? 0) > 0 && (
                            <span className="badge badge-amber product-waste-badge" title={`Adds ${fmtMoney(res?.waste_added ?? 0, cur, 4)} ingredient cost per piece`}>
                              Waste {((p.waste_pct ?? 0) * 100).toFixed(1).replace(/\.0$/, '')}%
                            </span>
                          )}
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
                        <td className="td-mono">
                          {hasMyPrice && res?.my_price_each !== undefined && res.my_price_each !== null ? (
                            <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {fmtMoney(res.my_price_each, cur)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="td-mono">
                          {hasMyPrice && profitEach !== undefined ? (
                            <span className={isBelowCost ? 'text-red' : 'text-green'}>
                              {fmtMoney(profitEach, cur)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {hasMyPrice && marginEach !== undefined ? (
                            <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {(marginEach * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
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
                    <th>My Price</th>
                    <th>Profit Each</th>
                    <th>Margin</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssembledProducts.map(p => {
                    const res = result.assembled_products[p.id];
                    const targetMargin = p.target_margin ?? data.settings.target_margin;
                    const marginEach = res?.margin_each;
                    const profitEach = res?.profit_each;
                    const hasMyPrice = p.my_price_each !== undefined && p.my_price_each !== null;
                    const isBelowCost = hasMyPrice && profitEach !== undefined && profitEach < 0;
                    const isBelowTarget = hasMyPrice && !isBelowCost && marginEach !== undefined && marginEach < targetMargin;

                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                          {(p.waste_pct ?? 0) > 0 && (
                            <span className="badge badge-amber product-waste-badge" title={`Adds ${fmtMoney(res?.waste_added ?? 0, cur, 4)} ingredient cost per piece`}>
                              Waste {((p.waste_pct ?? 0) * 100).toFixed(1).replace(/\.0$/, '')}%
                            </span>
                          )}
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
                        <td className="td-mono">
                          {hasMyPrice && res?.my_price_each !== undefined && res.my_price_each !== null ? (
                            <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {fmtMoney(res.my_price_each, cur)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="td-mono">
                          {hasMyPrice && profitEach !== undefined ? (
                            <span className={isBelowCost ? 'text-red' : 'text-green'}>
                              {fmtMoney(profitEach, cur)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {hasMyPrice && marginEach !== undefined ? (
                            <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {(marginEach * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
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
                      {allRecipesSorted.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.kind})
                        </option>
                      ))}
                    </select>
                    {editingBatch.recipe_id && (
                      <div style={{ width: 80 }}>
                        <NumberInput
                          value={batchMultipliers[editingBatch.recipe_id] ?? 1}
                          onChange={v => setBatchMultipliers(s => ({ ...s, [editingBatch.recipe_id]: v }))}
                          min={0} step={0.1} placeholder="Scale"
                          aria-label="Batch multiplier (preview only, not stored)"
                          title="Batch multiplier (preview only, not stored)"
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
              <div className="form-group product-waste-field">
                <label htmlFor="batch-product-waste">Waste / spoilage (%)</label>
                <NumberInput
                  id="batch-product-waste"
                  value={displayWastePercent(editingBatch.waste_pct)}
                  onChange={v => setEditingBatch(p => p && ({ ...p, waste_pct: v / 100 }))}
                  step={0.1}
                  aria-label="Batch product waste / spoilage percentage"
                />
                <span className="input-hint">A separate multiplier on ingredient-derived cost; labour, other cost, and box are excluded.</span>
                {(editingBatch.waste_pct ?? 0) >= 0.5 && (
                  <span className="text-red" role="status">High waste / spoilage (50% or more)</span>
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
                  <ComponentRow
                    key={ci}
                    type="recipe"
                    picker={<select className="select" aria-label="Recipe picker" value={comp.recipe_id} onChange={e => {
                        const comps = editingBatch.components.map((c, i) => i === ci ? { ...c, recipe_id: e.target.value } : c);
                        setEditingBatch(p => p && ({ ...p, components: comps }));
                      }} style={{ width: '100%', minWidth: 0 }}>
                        {allRecipesSorted.map(r => (
                          <option key={r.id} value={r.id}>
                            Recipe: {r.name} ({r.kind})
                          </option>
                        ))}
                      </select>}
                    scale={comp.recipe_id ? <NumberInput
                      value={batchMultipliers[comp.recipe_id] ?? 1}
                      onChange={v => setBatchMultipliers(s => ({ ...s, [comp.recipe_id]: v }))}
                      min={0} step={0.1} placeholder="×"
                      aria-label="Batch multiplier (preview only, not stored)"
                      title="Batch multiplier (preview only, not stored)"
                    /> : undefined}
                    grams={<NumberInput value={comp.grams} onChange={v => {
                      const comps = editingBatch.components.map((c, i) => i === ci ? { ...c, grams: v } : c);
                      setEditingBatch(p => p && ({ ...p, components: comps }));
                    }} placeholder="g" aria-label="Grams per piece" />}
                    remove={<button className="quote-toolbar-btn" onClick={() => setEditingBatch(p => p && ({ ...p, components: p.components.filter((_, i) => i !== ci) }))} title="Remove component" aria-label="Remove component" style={{ width: 32, height: 32, padding: 0 }}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                    </button>}
                  />
                ))}
              </div>

              {/* Pricing Overrides (R2) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowBatchOverrides(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined ms-16" aria-hidden>tune</span>
                    Pricing overrides
                  </span>
                  <span className="material-symbols-outlined ms-18" aria-hidden style={{ transform: `rotate(${showBatchOverrides ? 270 : 90}deg)`, transition: 'transform 0.15s' }}>
                    arrow_forward
                  </span>
                </button>
                {showBatchOverrides && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label>Overhead % (global: {(data.settings.overhead_pct * 100).toFixed(0)}%)</label>
                        <input
                          type="number"
                          className="input"
                          value={editingBatch.overhead_pct !== null && editingBatch.overhead_pct !== undefined && Number.isFinite(editingBatch.overhead_pct) ? editingBatch.overhead_pct * 100 : ''}
                          placeholder={(data.settings.overhead_pct * 100).toFixed(0)}
                          step={0.1}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingBatch(p => p && ({ ...p, overhead_pct: val === '' ? null : parsePercentToFraction(parseFloat(val)) }));
                          }}
                        />
                        <span className="input-hint">Applies to labour and the base recipe; component costs already include the global overhead.</span>
                      </div>
                      <div className="form-group">
                        <label>Target margin (global: {(data.settings.target_margin * 100).toFixed(0)}%)</label>
                        <input
                          type="number"
                          className="input"
                          value={editingBatch.target_margin !== null && editingBatch.target_margin !== undefined && Number.isFinite(editingBatch.target_margin) ? editingBatch.target_margin * 100 : ''}
                          placeholder={(data.settings.target_margin * 100).toFixed(0)}
                          step={0.1}
                          min={0}
                          max={99.9}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingBatch(p => p && ({ ...p, target_margin: val === '' ? null : parsePercentToFraction(parseFloat(val)) }));
                          }}
                        />
                        {overrideError && <span className="input-error">{overrideError}</span>}
                      </div>
                    </div>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label>Labour rate/hr (global: {data.settings.labour_rate_per_hour})</label>
                        <input
                          type="number"
                          className="input"
                          value={editingBatch.labour_rate_per_hour !== null && editingBatch.labour_rate_per_hour !== undefined ? editingBatch.labour_rate_per_hour : ''}
                          placeholder={String(data.settings.labour_rate_per_hour)}
                          step={1}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingBatch(p => p && ({ ...p, labour_rate_per_hour: val === '' ? null : parseFloat(val) }));
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label>Other cost per piece ({cur})</label>
                        <input
                          type="number"
                          className="input"
                          value={editingBatch.other_cost_per_piece !== undefined && editingBatch.other_cost_per_piece !== null && editingBatch.other_cost_per_piece !== 0 ? editingBatch.other_cost_per_piece : (editingBatch.other_cost_per_piece === 0 ? '0' : '')}
                          placeholder="0"
                          step={0.5}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setEditingBatch(p => p && ({ ...p, other_cost_per_piece: val === '' ? 0 : parseFloat(val) }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* My selling price (R3) & Live Result */}
              {(() => {
                const prev = { ...data, batch_products: [...data.batch_products.filter(p => p.id !== editingBatch.id), editingBatch] };
                const res = compute(prev, null, batchMultipliers).batch_products[editingBatch.id];
                if (!res) return null;

                const targetMargin = editingBatch.target_margin ?? data.settings.target_margin;
                const profitEach = res.profit_each;
                const marginEach = res.margin_each;
                const isBelowCost = profitEach !== undefined && profitEach < 0;
                const isBelowTarget = !isBelowCost && marginEach !== undefined && marginEach < targetMargin;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, background: 'var(--bg-surface-low)' }}>
                      <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'block' }}>
                        My selling price
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ width: 150 }}>
                          <input
                            type="number"
                            className="input"
                            value={editingBatch.my_price_each !== null && editingBatch.my_price_each !== undefined ? editingBatch.my_price_each : ''}
                            placeholder={`Calc: ${res.headline_each.toFixed(2)}`}
                            step={1}
                            min={0}
                            onChange={e => {
                              const val = e.target.value.trim();
                              setEditingBatch(p => p && ({ ...p, my_price_each: val === '' ? null : parseFloat(val) }));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="quote-toolbar-btn"
                          onClick={() => setEditingBatch(p => p && ({ ...p, my_price_each: res.headline_each }))}
                        >
                          Use calculated
                        </button>
                        {res.suggested_headline_each !== undefined && (
                          <button
                            type="button"
                            className="quote-toolbar-btn"
                            onClick={() => setEditingBatch(p => p && ({ ...p, my_price_each: res.suggested_headline_each }))}
                          >
                            Use suggested ({fmtMoney(res.suggested_headline_each, cur)})
                          </button>
                        )}
                        {editingBatch.my_price_each !== null && editingBatch.my_price_each !== undefined && (
                          <button
                            type="button"
                            className="quote-toolbar-btn"
                            onClick={() => setEditingBatch(p => p && ({ ...p, my_price_each: null }))}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {editingBatch.my_price_each !== null && editingBatch.my_price_each !== undefined && profitEach !== undefined && marginEach !== undefined && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                          <span>Profit/piece: <b className={isBelowCost ? 'text-red' : 'text-green'}>{fmtMoney(profitEach, cur)}</b></span>
                          <span>
                            Margin: <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {(marginEach * 100).toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="success-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <b>Pieces: {res.pieces.toFixed(2)}</b>
                      <span>Unit cost: {fmtMoney(res.unit_cost, cur, 4)}</span>
                      <span>Cost each excl. box: {fmtMoney(res.cost_each_excl_box, cur, 4)}</span>
                      <span>Cost each incl. box: {fmtMoney(res.cost_each_incl_box, cur, 4)}</span>
                      <span>Each excl. box: {fmtMoney(res.each_excluding_box, cur, 4)}</span>
                      <span>Each incl. box: {fmtMoney(res.each_including_box, cur, 4)}</span>
                      <span>Box (full): {fmtMoney(res.box_price, cur)}</span>
                      <b>Calculated headline each: {fmtMoney(res.headline_each, cur)}</b>
                      {res.suggested_headline_each !== undefined && (
                        <span style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
                          Suggested: {fmtMoney(res.suggested_headline_each, cur)}
                        </span>
                      )}
                      {res.warnings.length > 0 && (
                        <div style={{ width: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
                          <WarningsList warnings={res.warnings} limit={3} />
                        </div>
                      )}
                    </div>
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
              <div className="form-group product-waste-field">
                <label htmlFor="assembled-product-waste">Waste / spoilage (%)</label>
                <NumberInput
                  id="assembled-product-waste"
                  value={displayWastePercent(editingAssembled.waste_pct)}
                  onChange={v => setEditingAssembled(p => p && ({ ...p, waste_pct: v / 100 }))}
                  step={0.1}
                  aria-label="Assembled product waste / spoilage percentage"
                />
                <span className="input-hint">A separate multiplier on ingredient-derived cost; labour, other cost, and box are excluded.</span>
                {(editingAssembled.waste_pct ?? 0) >= 0.5 && (
                  <span className="text-red" role="status">High waste / spoilage (50% or more)</span>
                )}
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

              {/* Pricing Overrides (R2) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowAssembledOverrides(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined ms-16" aria-hidden>tune</span>
                    Pricing overrides
                  </span>
                  <span className="material-symbols-outlined ms-18" aria-hidden style={{ transform: `rotate(${showAssembledOverrides ? 270 : 90}deg)`, transition: 'transform 0.15s' }}>
                    arrow_forward
                  </span>
                </button>
                {showAssembledOverrides && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label>Overhead % (global: {(data.settings.overhead_pct * 100).toFixed(0)}%)</label>
                        <input
                          type="number"
                          className="input"
                          value={editingAssembled.overhead_pct !== null && editingAssembled.overhead_pct !== undefined && Number.isFinite(editingAssembled.overhead_pct) ? editingAssembled.overhead_pct * 100 : ''}
                          placeholder={(data.settings.overhead_pct * 100).toFixed(0)}
                          step={0.1}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingAssembled(p => p && ({ ...p, overhead_pct: val === '' ? null : parsePercentToFraction(parseFloat(val)) }));
                          }}
                        />
                        <span className="input-hint">Applies to labour and the base recipe; component costs already include the global overhead.</span>
                      </div>
                      <div className="form-group">
                        <label>Target margin (global: {(data.settings.target_margin * 100).toFixed(0)}%)</label>
                        <input
                          type="number"
                          className="input"
                          value={editingAssembled.target_margin !== null && editingAssembled.target_margin !== undefined && Number.isFinite(editingAssembled.target_margin) ? editingAssembled.target_margin * 100 : ''}
                          placeholder={(data.settings.target_margin * 100).toFixed(0)}
                          step={0.1}
                          min={0}
                          max={99.9}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingAssembled(p => p && ({ ...p, target_margin: val === '' ? null : parsePercentToFraction(parseFloat(val)) }));
                          }}
                        />
                        {overrideError && <span className="input-error">{overrideError}</span>}
                      </div>
                    </div>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label>Labour rate/hr (global: {data.settings.labour_rate_per_hour})</label>
                        <input
                          type="number"
                          className="input"
                          value={editingAssembled.labour_rate_per_hour !== null && editingAssembled.labour_rate_per_hour !== undefined ? editingAssembled.labour_rate_per_hour : ''}
                          placeholder={String(data.settings.labour_rate_per_hour)}
                          step={1}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setOverrideError(null);
                            setEditingAssembled(p => p && ({ ...p, labour_rate_per_hour: val === '' ? null : parseFloat(val) }));
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label>Other cost per piece ({cur})</label>
                        <input
                          type="number"
                          className="input"
                          value={editingAssembled.other_cost_per_piece !== undefined && editingAssembled.other_cost_per_piece !== null && editingAssembled.other_cost_per_piece !== 0 ? editingAssembled.other_cost_per_piece : (editingAssembled.other_cost_per_piece === 0 ? '0' : '')}
                          placeholder="0"
                          step={0.5}
                          min={0}
                          onChange={e => {
                            const val = e.target.value.trim();
                            setEditingAssembled(p => p && ({ ...p, other_cost_per_piece: val === '' ? 0 : parseFloat(val) }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
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
                  <ComponentRow
                    key={ci}
                    type={comp.type}
                    picker={<select className="select" aria-label={comp.type === 'ingredient_grams' ? 'Ingredient picker' : 'Recipe picker'} value={comp.type === 'ingredient_grams' ? comp.ingredient_id : comp.recipe_id} onChange={e => {
                        if (comp.type === 'ingredient_grams') updateComponent(ci, { ingredient_id: e.target.value } as Partial<AssembledComponent>);
                        else updateComponent(ci, { recipe_id: e.target.value } as Partial<AssembledComponent>);
                      }} style={{ width: '100%', minWidth: 0 }}>
                        {comp.type === 'ingredient_grams'
                          ? gramIngredients.length === 0
                            ? <option value="" disabled>Add a gram-type ingredient first</option>
                            : gramIngredients.map(i => <option key={i.id} value={i.id}>Ingredient: {i.name}</option>)
                          : allRecipesSorted.map(r => (
                              <option key={r.id} value={r.id}>
                                Recipe: {r.name} ({r.kind})
                              </option>
                            ))
                        }
                      </select>}
                    scale={comp.type !== 'ingredient_grams' && comp.recipe_id ? <NumberInput
                      value={batchMultipliers[comp.recipe_id] ?? 1}
                      onChange={v => setBatchMultipliers(s => ({ ...s, [comp.recipe_id]: v }))}
                      min={0} step={0.1} placeholder="×"
                      aria-label="Batch multiplier (preview only, not stored)"
                      title="Batch multiplier (preview only, not stored)"
                    /> : undefined}
                    grams={<NumberInput value={comp.grams} onChange={v => updateComponent(ci, { grams: v } as Partial<AssembledComponent>)} placeholder="g" aria-label="Grams per piece" />}
                    remove={<button className="quote-toolbar-btn" onClick={() => removeComponent(ci)} title="Remove component" aria-label="Remove component" style={{ width: 32, height: 32, padding: 0 }}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                    </button>}
                  />
                ))}
              </div>

              {/* My selling price (R3) & Live result */}
              {(() => {
                const prev = { ...data, assembled_products: [...data.assembled_products.filter(p => p.id !== editingAssembled.id), editingAssembled] };
                const res = compute(prev, null, batchMultipliers).assembled_products[editingAssembled.id];
                if (!res) return null;

                const targetMargin = editingAssembled.target_margin ?? data.settings.target_margin;
                const profitEach = res.profit_each;
                const marginEach = res.margin_each;
                const isBelowCost = profitEach !== undefined && profitEach < 0;
                const isBelowTarget = !isBelowCost && marginEach !== undefined && marginEach < targetMargin;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, background: 'var(--bg-surface-low)' }}>
                      <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'block' }}>
                        My selling price
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ width: 150 }}>
                          <input
                            type="number"
                            className="input"
                            value={editingAssembled.my_price_each !== null && editingAssembled.my_price_each !== undefined ? editingAssembled.my_price_each : ''}
                            placeholder={`Calc: ${res.price_each.toFixed(2)}`}
                            step={1}
                            min={0}
                            onChange={e => {
                              const val = e.target.value.trim();
                              setEditingAssembled(p => p && ({ ...p, my_price_each: val === '' ? null : parseFloat(val) }));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="quote-toolbar-btn"
                          onClick={() => setEditingAssembled(p => p && ({ ...p, my_price_each: res.price_each }))}
                        >
                          Use calculated
                        </button>
                        {res.suggested_price_each !== undefined && (
                          <button
                            type="button"
                            className="quote-toolbar-btn"
                            onClick={() => setEditingAssembled(p => p && ({ ...p, my_price_each: res.suggested_price_each }))}
                          >
                            Use suggested ({fmtMoney(res.suggested_price_each, cur)})
                          </button>
                        )}
                        {editingAssembled.my_price_each !== null && editingAssembled.my_price_each !== undefined && (
                          <button
                            type="button"
                            className="quote-toolbar-btn"
                            onClick={() => setEditingAssembled(p => p && ({ ...p, my_price_each: null }))}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {editingAssembled.my_price_each !== null && editingAssembled.my_price_each !== undefined && profitEach !== undefined && marginEach !== undefined && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                          <span>Profit/piece: <b className={isBelowCost ? 'text-red' : 'text-green'}>{fmtMoney(profitEach, cur)}</b></span>
                          <span>
                            Margin: <span className={isBelowCost ? 'badge badge-red' : isBelowTarget ? 'badge badge-amber' : 'badge badge-green'}>
                              {(marginEach * 100).toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="success-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <span>Unit cost (components): {fmtMoney(res.unit_cost, cur, 4)}</span>
                      <span>Labour/piece: {fmtMoney(res.labour_piece, cur, 4)}</span>
                      <span>Box/piece: {fmtMoney(res.box_piece, cur, 4)}</span>
                      <span>Cost each: {fmtMoney(res.cost_each, cur, 4)}</span>
                      <b>Calculated price each: {fmtMoney(res.price_each, cur)}</b>
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
