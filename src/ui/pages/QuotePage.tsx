import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '../../store/store';
import { compute } from '../../engine/engine';
import type { TierInput, SavedQuote } from '../../engine/types';
import { ExplainPanel } from '../components/ExplainPanel';
import { WarningsList } from '../components/WarningsList';
import { NumberInput } from '../components/Shared';

function fmt(n: number, cur: string): string {
  return `${cur} ${n.toFixed(2)}`;
}

export function QuotePage() {
  const { state, dispatch } = useStore();
  const { data, quoteInput, activeSavedQuote } = state;
  const { settings } = data;
  const cur = settings.currency_code;

  const [showExplain, setShowExplain] = useState(false);
  const [activeTiers, setActiveTiers] = useState(1); // how many tier cards shown

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNotes, setSaveNotes] = useState('');

  // Live calculation from current catalog
  const result = useMemo(() => compute(data, quoteInput), [data, quoteInput]);
  const liveQ = result.quote;

  // Displayed quote: if viewing a saved quote snapshot without recalculation, show snapshot
  const displayQ = useMemo(() => {
    if (activeSavedQuote && !activeSavedQuote.isRecalculated && activeSavedQuote.snapshot) {
      return activeSavedQuote.snapshot as typeof liveQ;
    }
    return liveQ;
  }, [activeSavedQuote, liveQ]);

  // Phase 5 — detect ingredient price changes since the quote was saved
  const priceChangedIngredients = useMemo(() => {
    if (!activeSavedQuote || !activeSavedQuote.snapshot) return [];
    const snapshot = activeSavedQuote.snapshot as any;
    if (!Array.isArray(snapshot?.ingredient_prices)) return [];
    return (snapshot.ingredient_prices as Array<{ id: string; pack_price: number; pack_quantity: number }>)
      .filter(sp => {
        const cur = data.ingredients.find(i => i.id === sp.id);
        return cur && (cur.pack_price !== sp.pack_price || cur.pack_quantity !== sp.pack_quantity);
      })
      .map(sp => data.ingredients.find(i => i.id === sp.id)!.name);
  }, [activeSavedQuote, data.ingredients]);

  // Expand active tiers if loaded quote has higher tiers filled
  useEffect(() => {
    let maxFilled = 1;
    quoteInput.tiers.forEach((t, i) => {
      if ((t.size_kg ?? 0) > 0) maxFilled = i + 1;
    });
    setActiveTiers(prev => Math.max(prev, maxFilled));
  }, [quoteInput.tiers]);

  const onInputModified = useCallback(() => {
    if (activeSavedQuote && !activeSavedQuote.isRecalculated) {
      dispatch({ type: 'RECALCULATE_SAVED_QUOTE' });
    }
  }, [activeSavedQuote, dispatch]);

  const updateDecoration = useCallback((field: keyof typeof quoteInput.decoration, value: number) => {
    onInputModified();
    dispatch({
      type: 'SET_QUOTE_INPUT',
      input: {
        ...quoteInput,
        decoration: { ...quoteInput.decoration, [field]: value },
      },
    });
  }, [dispatch, quoteInput, onInputModified]);

  const updateTier = useCallback((idx: number, update: Partial<TierInput>) => {
    onInputModified();
    const newTiers = quoteInput.tiers.map((t, i) => i === idx ? { ...t, ...update } : t);
    dispatch({ type: 'SET_QUOTE_INPUT', input: { ...quoteInput, tiers: newTiers } });
  }, [dispatch, quoteInput, onInputModified]);

  const flavourOptions = [...data.flavours].sort((a, b) => a.name.localeCompare(b.name));
  const fillingOptions = [...data.fillings].sort((a, b) => a.name.localeCompare(b.name));

  const copyText = () => {
    if (!displayQ) return;
    const lines = [
      `Bakery Quote`,
      `Tier Cost:   ${fmt(displayQ.tier_cost, cur)}`,
      `Overhead:    ${fmt(displayQ.overhead, cur)}`,
      `Packaging:   ${fmt(displayQ.packaging, cur)}`,
      `Delivery:    ${fmt(displayQ.delivery, cur)}`,
      `──────────────────`,
      `TOTAL COST:  ${fmt(displayQ.total_cost, cur)}`,
      `Profit:      ${fmt(displayQ.profit, cur)}`,
      ...(displayQ.discount > 0 ? [`Discount:    -${fmt(displayQ.discount, cur)}`] : []),
      `TOTAL PRICE: ${fmt(displayQ.total_price, cur)}`,
      `Margin:      ${(displayQ.margin_check * 100).toFixed(1)}%`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  };

  const handleOpenSaveDialog = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultName = activeSavedQuote?.name || `Quote ${todayStr}`;
    setSaveName(defaultName);
    setSaveNotes(activeSavedQuote?.notes || '');
    setShowSaveDialog(true);
  };

  const handleSaveQuote = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    // Capture ingredient prices at save time for Phase 5 price-change detection
    const ingredientPrices = data.ingredients.map(i => ({
      id: i.id,
      pack_price: i.pack_price,
      pack_quantity: i.pack_quantity,
    }));
    const snapshot = liveQ
      ? { ...JSON.parse(JSON.stringify(liveQ)), ingredient_prices: ingredientPrices }
      : null;
    const quoteToSave: SavedQuote = {
      id: activeSavedQuote?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sq-${Date.now()}`),
      name: saveName.trim() || `Quote ${todayStr}`,
      created_at: activeSavedQuote?.created_at || now,
      updated_at: now,
      input: JSON.parse(JSON.stringify(quoteInput)),
      result_snapshot: snapshot,
      notes: saveNotes.trim() || undefined,
    };
    dispatch({ type: 'ADD_SAVED_QUOTE', item: quoteToSave });
    setShowSaveDialog(false);
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title gradient-text">Cake Quote</h1>
            <p className="page-subtitle">Configure your tiered cake and get an instant price</p>
          </div>
          {displayQ && (
            <div className="flex gap-8">
              <button className="btn btn-ghost btn-sm" onClick={copyText}>📋 Copy</button>
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨 Print</button>
              <button className="btn btn-secondary btn-sm" onClick={handleOpenSaveDialog}>💾 Save quote</button>
              <button className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: 'RESET_QUOTE' })}>Reset</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowExplain(true)}>🔍 Explain</button>
            </div>
          )}
        </div>
      </div>

      {/* Banner if loaded from saved quote */}
      {activeSavedQuote && (
        <div
          className="saved-quote-banner"
          style={{
            background: 'rgba(167, 139, 250, 0.12)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--r-md)',
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>💾</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Loaded from saved quote: {activeSavedQuote.name} — {new Date(activeSavedQuote.created_at).toLocaleDateString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeSavedQuote.isRecalculated
                  ? '⚡ Recalculated with current catalogue prices (snapshot unchanged).'
                  : '📌 Showing price snapshot from save time.'}
                {activeSavedQuote.notes ? ` • Note: ${activeSavedQuote.notes}` : ''}
              </div>
              {!activeSavedQuote.isRecalculated && priceChangedIngredients.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--accent-amber)', fontWeight: 500 }}>
                  ⚠ Ingredient prices have changed since this quote was saved: {priceChangedIngredients.join(', ')}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!activeSavedQuote.isRecalculated && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => dispatch({ type: 'RECALCULATE_SAVED_QUOTE' })}
              >
                🔄 Recalculate with current prices
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => dispatch({ type: 'CLEAR_ACTIVE_SAVED_QUOTE' })}
              title="Close banner"
              aria-label="Close saved quote banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        {/* Left: configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tiers */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">🎂 Tiers</div>
                <div className="card-subtitle">Tier 1 is required. Add up to 6 tiers.</div>
              </div>
              {activeTiers < 6 && (
                <button className="btn btn-secondary btn-sm" onClick={() => setActiveTiers(t => Math.min(t + 1, 6))}>
                  + Add tier
                </button>
              )}
            </div>
            <div className="tier-cards">
              {Array.from({ length: activeTiers }, (_, idx) => {
                const tier = quoteInput.tiers[idx];
                const res = displayQ?.tier_details?.[idx];
                const isActive = (tier.size_kg ?? 0) > 0;
                return (
                  <div key={idx} className={`tier-card ${isActive ? 'active' : ''}`}>
                    <div className="tier-card-header">
                      <span className="tier-label">Tier {idx + 1}{idx === 0 ? ' *' : ''}</span>
                      {isActive && res && (
                        <span className="badge badge-accent" style={{ fontSize: 11 }}>
                          {fmt(res.flavour_part + res.filling_part, cur)}
                        </span>
                      )}
                      {idx > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          updateTier(idx, { size_kg: 0, flavour_id: null, filling_id: null });
                          if (idx === activeTiers - 1) setActiveTiers(t => t - 1);
                        }} style={{ marginLeft: 'auto', padding: '3px 7px' }}>✕</button>
                      )}
                    </div>
                    <div className="form-row form-row-3" style={{ gap: 10 }}>
                      <div className="form-group">
                        <label>Size (kg)</label>
                        <NumberInput
                          value={tier.size_kg ?? 0}
                          onChange={v => updateTier(idx, { size_kg: v })}
                          step={0.1}
                          placeholder="kg"
                        />
                        {/* Size guide pills */}
                        {data.size_guide.length > 0 && (
                          <div className="size-guide-pills">
                            {data.size_guide.slice(0, 5).map(sg => (
                              <button
                                key={sg.label}
                                className="size-pill"
                                onClick={() => updateTier(idx, { size_kg: sg.kg })}
                                title={`${sg.label} — ${sg.servings} servings`}
                              >
                                {sg.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Flavour</label>
                        <select
                          className="select"
                          value={tier.flavour_id ?? ''}
                          onChange={e => updateTier(idx, { flavour_id: e.target.value || null })}
                        >
                          <option value="">— pick flavour —</option>
                          {flavourOptions.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Filling</label>
                        <select
                          className="select"
                          value={tier.filling_id ?? ''}
                          onChange={e => updateTier(idx, { filling_id: e.target.value || null })}
                        >
                          <option value="">— pick filling —</option>
                          {fillingOptions.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Decoration */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">🎨 Decoration & Extras</div>
            </div>
            <div className="form-row form-row-3" style={{ gap: 12 }}>
              <div className="form-group">
                <label>Fondant (kg)</label>
                <NumberInput value={quoteInput.decoration.fondant_kg} onChange={v => updateDecoration('fondant_kg', v)} step={0.1} />
              </div>
              <div className="form-group">
                <label>Edible Prints (count)</label>
                <NumberInput value={quoteInput.decoration.prints} onChange={v => updateDecoration('prints', v)} />
              </div>
              <div className="form-group">
                <label>Flowers ({cur})</label>
                <NumberInput value={quoteInput.decoration.flowers} onChange={v => updateDecoration('flowers', v)} />
              </div>
              <div className="form-group">
                <label>Toppers (count)</label>
                <NumberInput value={quoteInput.decoration.toppers} onChange={v => updateDecoration('toppers', v)} />
              </div>
              <div className="form-group">
                <label>Time (hours)</label>
                <NumberInput value={quoteInput.decoration.time_hours} onChange={v => updateDecoration('time_hours', v)} step={0.5} />
                {quoteInput.decoration.time_hours === 0 && (
                  <span className="input-hint" style={{ color: 'var(--accent-amber)' }}>⚠ 0 hours = free labour</span>
                )}
              </div>
              <div className="form-group">
                <label>Other costs ({cur})</label>
                <NumberInput value={quoteInput.decoration.others} onChange={v => updateDecoration('others', v)} />
              </div>
              <div className="form-group">
                <label>Delivery ({cur})</label>
                <NumberInput value={quoteInput.decoration.delivery} onChange={v => updateDecoration('delivery', v)} />
                <span className="input-hint">No overhead/profit on delivery</span>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Discount ({cur}) <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— comes out of profit only</span></label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 120px' }}>
                    <NumberInput
                      value={quoteInput.decoration.discount ?? 0}
                      onChange={v => updateDecoration('discount', Math.max(0, v))}
                      placeholder="0"
                    />
                  </div>
                  {/* Quick-fill buttons — render when displayQ exists */}
                  {displayQ && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateDecoration('discount', 0)}>0</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateDecoration('discount', parseFloat((displayQ.profit * 0.25).toFixed(2)))}>25%</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateDecoration('discount', parseFloat((displayQ.profit * 0.50).toFixed(2)))}>50%</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => updateDecoration('discount', parseFloat(displayQ.profit.toFixed(2)))} title="Sell at cost">100% (cost)</button>
                    </>
                  )}
                </div>
                {displayQ && displayQ.discount_capped && (
                  <span className="input-hint" style={{ color: 'var(--accent-amber)' }}>
                    ⚠ Capped to available profit ({fmt(displayQ.discount, cur)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Warnings */}
          {displayQ && displayQ.warnings.length > 0 && (
            <WarningsList warnings={displayQ.warnings} limit={5} />
          )}
        </div>

        {/* Right: results */}
        <div style={{ position: 'sticky', top: 80 }}>
          {!displayQ ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">🎂</div>
                <div className="empty-state-title">Enter Tier 1 size</div>
                <div className="empty-state-text">Set a weight in Tier 1 to see pricing</div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="results-big">
                <div className="text-secondary text-sm mb-4">TOTAL PRICE</div>
                <div className="money-xl">{fmt(displayQ.total_price, cur)}</div>
                {displayQ.suggested_price !== undefined && (
                  <div className="mt-4 suggested-price-line">
                    <span className="badge badge-amber" style={{ fontSize: 13, padding: '4px 10px' }}>
                      Suggested: {fmt(displayQ.suggested_price, cur)} (rounded to nearest {settings.price_rounding_step})
                    </span>
                  </div>
                )}
                <div className="mt-4 text-sm text-muted">
                  Margin {(displayQ.margin_check * 100).toFixed(1)}% · {displayQ.tiers_used} tier{displayQ.tiers_used !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="result-row">
                <span className="result-row-label">Tier cost</span>
                <span className="money">{fmt(displayQ.tier_cost, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Fondant</span>
                <span className="font-mono text-secondary">{fmt(displayQ.fondant, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Print(s)</span>
                <span className="font-mono text-secondary">{fmt(displayQ.print, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Flowers</span>
                <span className="font-mono text-secondary">{fmt(displayQ.flowers, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Toppers</span>
                <span className="font-mono text-secondary">{fmt(displayQ.topper, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Labour (time)</span>
                <span className="font-mono text-secondary">{fmt(displayQ.time, cur)}</span>
              </div>
              <div className="result-row" style={{ paddingLeft: 12, fontSize: 12 }}>
                <span className="text-muted">Others</span>
                <span className="font-mono text-secondary">{fmt(displayQ.others, cur)}</span>
              </div>
              <div className="result-row">
                <span className="result-row-label">Delivery</span>
                <span className="money">{fmt(displayQ.delivery, cur)}</span>
              </div>
              <div className="result-row">
                <span className="result-row-label">Overhead</span>
                <span className="money">{fmt(displayQ.overhead, cur)}</span>
              </div>
              <div className="result-row">
                <span className="result-row-label">Packaging</span>
                <span className="money">{fmt(displayQ.packaging, cur)}</span>
              </div>
              <div className="result-row result-row-total" style={{ padding: '12px 0', marginTop: 4, borderTop: '2px solid var(--border)' }}>
                <span>TOTAL COST</span>
                <span className="money">{fmt(displayQ.total_cost, cur)}</span>
              </div>
              <div className="result-row">
                <span className="result-row-label">Profit ({(settings.target_margin * 100).toFixed(0)}% margin)</span>
                <span className="money">{fmt(displayQ.profit, cur)}</span>
              </div>
              {displayQ.discount > 0 && (
                <div className="result-row" style={{ color: 'var(--accent-amber)' }}>
                  <span className="result-row-label">
                    Discount
                    {displayQ.discount_capped && (
                      <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.8 }}>(capped to profit)</span>
                    )}
                  </span>
                  <span className="money">− {fmt(displayQ.discount, cur)}</span>
                </div>
              )}
              <div className="result-row" style={{ padding: '12px 0', marginTop: 4, borderTop: '2px solid var(--accent-dim)' }}>
                <span className="result-row-total" style={{ fontSize: 16 }}>TOTAL PRICE</span>
                <span className="result-row-price">{fmt(displayQ.total_price, cur)}</span>
              </div>
              {displayQ.suggested_price !== undefined && (
                <div
                  className="result-row suggested-price-row"
                  style={{ borderBottom: 'none', paddingBottom: 0, paddingTop: 4 }}
                >
                  <span className="text-muted text-sm">
                    Suggested (nearest {settings.price_rounding_step})
                  </span>
                  <span className="badge badge-amber" style={{ fontSize: 12 }}>
                    {fmt(displayQ.suggested_price, cur)}
                  </span>
                </div>
              )}
              {displayQ.suggested_price !== undefined && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 8, textAlign: 'right' }}>
                  Rounding is display-only — never used in calculations.
                </div>
              )}
              <div className="result-row" style={{ borderBottom: 'none' }}>
                <span className="text-muted text-sm">Margin check</span>
                <span className="badge badge-green">{(displayQ.margin_check * 100).toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Quote Dialog */}
      {showSaveDialog && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 440, background: 'var(--bg-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-header">
              <div className="card-title">💾 Save Quote</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSaveDialog(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              <div className="form-group">
                <label>Quote Name</label>
                <input
                  type="text"
                  className="input"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder={`Quote ${new Date().toISOString().slice(0, 10)}`}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={saveNotes}
                  onChange={e => setSaveNotes(e.target.value)}
                  placeholder="e.g. Wedding cake for Sarah, floral theme..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveQuote}>
                  Save Quote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExplain && displayQ && (
        <ExplainPanel
          title="Cake Quote"
          audit={displayQ.audit}
          currency={cur}
          onClose={() => setShowExplain(false)}
        />
      )}
    </div>
  );
}
