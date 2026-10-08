import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { BatchProduct, AssembledProduct, AssembledComponent } from '../../engine/types';
import { compute } from '../../engine/engine';
import { NumberInput, ConfirmDialog, Toggle } from '../components/Shared';
import { ExplainPanel } from '../components/ExplainPanel';
import { WarningsList } from '../components/WarningsList';
import { generateId } from '../../engine/utils';

function fmt(n: number, cur: string) { return `${cur} ${n.toFixed(2)}`; }

export function ProductsPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [tab, setTab] = useState<'batch' | 'assembled'>('batch');
  const [editingBatch, setEditingBatch] = useState<BatchProduct | null>(null);
  const [editingAssembled, setEditingAssembled] = useState<AssembledProduct | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: 'batch' | 'assembled' } | null>(null);
  const [explainBatch, setExplainBatch] = useState<string | null>(null);
  const [explainAssembled, setExplainAssembled] = useState<string | null>(null);

  const [batchMultipliers, setBatchMultipliers] = useState<Record<string, number>>({});

  const result = useMemo(() => compute(data, null, batchMultipliers), [data, batchMultipliers]);

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
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">🍩 Products</h1>
            <p className="page-subtitle">Batch products (donuts, cookies) and assembled products (cupcakes, cake pops)</p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={tab === 'batch' ? openNewBatch : openNewAssembled}
          >
            + Add {tab === 'batch' ? 'batch product' : 'assembled product'}
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${tab === 'batch' ? 'active' : ''}`} onClick={() => setTab('batch')}>
            Batch products ({data.batch_products.length})
          </button>
          <button className={`tab ${tab === 'assembled' ? 'active' : ''}`} onClick={() => setTab('assembled')}>
            Assembled products ({data.assembled_products.length})
          </button>
        </div>

        {tab === 'batch' && (
          data.batch_products.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🍩</div>
              <div className="empty-state-title">No batch products yet</div>
              <button className="btn btn-primary mt-12" onClick={openNewBatch}>+ Add batch product</button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pieces</th>
                    <th>Unit cost</th>
                    <th>Each (excl box)</th>
                    <th>Each (incl box)</th>
                    <th>Box price</th>
                    <th>Headline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.batch_products].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
                    const res = result.batch_products[p.id];
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                        </td>
                        <td className="td-mono">{res?.pieces.toFixed(2) ?? '—'}</td>
                        <td className="td-mono">{res ? fmt(res.unit_cost, cur) : '—'}</td>
                        <td className="td-mono">{res ? fmt(res.each_excluding_box, cur) : '—'}</td>
                        <td className="td-mono">{res ? fmt(res.each_including_box, cur) : '—'}</td>
                        <td className="td-mono text-green">{res ? fmt(res.box_price, cur) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <span className="badge badge-accent">
                              {res ? fmt(res.headline_each, cur) : '—'}
                            </span>
                            {res?.suggested_headline_each !== undefined && (
                              <span style={{ fontSize: 11, color: 'var(--accent-amber)', whiteSpace: 'nowrap' }}>
                                Sugg: {fmt(res.suggested_headline_each, cur)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="td-actions">
                            {res && <button className="btn btn-ghost btn-sm" onClick={() => setExplainBatch(p.id)}>🔍</button>}
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setIsNew(false); setEditingBatch({ ...p }); }}>✏️</button>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteTarget({ id: p.id, name: p.name, type: 'batch' })}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'assembled' && (
          data.assembled_products.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧁</div>
              <div className="empty-state-title">No assembled products yet</div>
              <button className="btn btn-primary mt-12" onClick={openNewAssembled}>+ Add assembled product</button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pieces/batch</th>
                    <th>Unit cost</th>
                    <th>Labour/piece</th>
                    <th>Price each</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.assembled_products].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
                    const res = result.assembled_products[p.id];
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                        </td>
                        <td className="td-mono">{p.pieces_per_batch}</td>
                        <td className="td-mono">{res ? fmt(res.unit_cost, cur) : '—'}</td>
                        <td className="td-mono">{res ? fmt(res.labour_piece, cur) : '—'}</td>
                        <td className="td-mono">
                          <div className="text-green">{res ? fmt(res.price_each, cur) : '—'}</div>
                          {res?.suggested_price_each !== undefined && (
                            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--accent-amber)', fontFamily: 'var(--font-sans)', textAlign: 'right' }}>
                              Sugg: {fmt(res.suggested_price_each, cur)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="td-actions">
                            {res && <button className="btn btn-ghost btn-sm" onClick={() => setExplainAssembled(p.id)}>🔍</button>}
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setIsNew(false); setEditingAssembled({ ...p }); }}>✏️</button>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteTarget({ id: p.id, name: p.name, type: 'assembled' })}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Batch product editor */}
      {editingBatch && (
        <div className="modal-backdrop" onClick={() => setEditingBatch(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isNew ? 'New batch product' : `Edit: ${editingBatch.name}`}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingBatch(null)}>✕</button>
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
                <div className="card-header" style={{ marginBottom: 8 }}>
                  <span className="card-title">Extra components per piece (e.g. macaron filling)</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingBatch(p => p && ({ ...p, components: [...p.components, { recipe_id: frostingRecipes[0]?.id ?? '', grams: 15 }] }))}>
                    + Component
                  </button>
                </div>
                {editingBatch.components.map((comp, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="select" value={comp.recipe_id} onChange={e => {
                        const comps = editingBatch.components.map((c, i) => i === ci ? { ...c, recipe_id: e.target.value } : c);
                        setEditingBatch(p => p && ({ ...p, components: comps }));
                      }} style={{ flex: 1 }}>
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
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => setEditingBatch(p => p && ({ ...p, components: p.components.filter((_, i) => i !== ci) }))}>✕</button>
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
                    <span>Unit cost: {fmt(res.unit_cost, cur)}</span>
                    <span>Each excl. box: {fmt(res.each_excluding_box, cur)}</span>
                    <span>Each incl. box: {fmt(res.each_including_box, cur)}</span>
                    <span>Box (full): {fmt(res.box_price, cur)}</span>
                    {res.warnings.length > 0 && <WarningsList warnings={res.warnings} limit={3} />}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingBatch(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBatch} disabled={!editingBatch.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Assembled product editor */}
      {editingAssembled && (
        <div className="modal-backdrop" onClick={() => setEditingAssembled(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isNew ? 'New assembled product' : `Edit: ${editingAssembled.name}`}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingAssembled(null)}>✕</button>
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
                <div className="card-header" style={{ marginBottom: 8 }}>
                  <span className="card-title">Components</span>
                  <div className="flex gap-4">
                    <button className="btn btn-secondary btn-sm" onClick={() => addComponent('cake_recipe_grams')}>+ Cake grams</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addComponent('recipe_per_gram')}>+ Recipe/gram</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => addComponent('ingredient_grams')}>+ Ingredient</button>
                  </div>
                </div>
                {editingAssembled.components.map((comp, ci) => (
                  <div key={ci} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span className="badge badge-muted" style={{ fontSize: 11 }}>
                      {comp.type === 'cake_recipe_grams' ? '🎂 Cake' : comp.type === 'recipe_per_gram' ? '🍮 Recipe' : '🧂 Ingredient'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="select" value={comp.type === 'ingredient_grams' ? comp.ingredient_id : comp.recipe_id} onChange={e => {
                        if (comp.type === 'ingredient_grams') updateComponent(ci, { ingredient_id: e.target.value } as Partial<AssembledComponent>);
                        else updateComponent(ci, { recipe_id: e.target.value } as Partial<AssembledComponent>);
                      }} style={{ flex: 1 }}>
                        {comp.type === 'ingredient_grams'
                          ? [...data.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                          : (comp.type === 'cake_recipe_grams' ? cakeRecipes : frostingRecipes).map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                        }
                      </select>
                      {comp.type !== 'ingredient_grams' && comp.recipe_id && (
                        <div style={{ width: 80 }}>
                          <NumberInput
                            value={batchMultipliers[comp.recipe_id] ?? 1}
                            onChange={v => setBatchMultipliers(s => ({ ...s, [comp.recipe_id]: v }))}
                            min={0} step={0.1} placeholder="Scale"
                          />
                        </div>
                      )}
                    </div>
                    <NumberInput value={comp.grams} onChange={v => updateComponent(ci, { grams: v } as Partial<AssembledComponent>)} placeholder="g" />
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeComponent(ci)}>✕</button>
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
                    <span>Unit cost: {fmt(res.unit_cost, cur)}</span>
                    <span>Labour/piece: {fmt(res.labour_piece, cur)}</span>
                    <span>Box/piece: {fmt(res.box_piece, cur)}</span>
                    <b>Price each: {fmt(res.price_each, cur)}</b>
                    {res.suggested_price_each !== undefined && (
                      <span style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
                        Suggested: {fmt(res.suggested_price_each, cur)}
                      </span>
                    )}
                    {res.warnings.length > 0 && <WarningsList warnings={res.warnings} limit={3} />}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingAssembled(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAssembled} disabled={!editingAssembled.name.trim()}>Save</button>
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
