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
  const [ledgerOpen, setLedgerOpen] = useState(false);

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

  // Handle ESC on save dialog
  useEffect(() => {
    if (showSaveDialog) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setShowSaveDialog(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showSaveDialog]);

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

  // Add-ons total calculation
  const decorationsTotal = displayQ
    ? displayQ.fondant + displayQ.print + displayQ.flowers + displayQ.topper + displayQ.others
    : 0;

  // Margin progress ratio
  const marginRatio = displayQ && settings.target_margin > 0
    ? displayQ.margin_check / settings.target_margin
    : 0;
  const isMarginMet = displayQ ? displayQ.margin_check >= settings.target_margin : false;

  return (
    <div className="quote-page-root">
      {/* Header with Breadcrumb and Toolbar */}
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Quote Studio</span>
            <span className="quote-crumb-sep">/</span>
            <span>Bespoke Engineering</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Live Calculation Mode</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Tiered Cake Quote Builder</h1>
          </div>
        </div>

        <div className="quote-toolbar">
          <button className="quote-toolbar-btn" id="explain-btn" onClick={() => setShowExplain(true)} disabled={!displayQ} aria-label="Explain cost calculation">
            <span aria-hidden>🧠</span>
            <span>Explain Cost</span>
          </button>
          <button className="quote-toolbar-btn" onClick={copyText} disabled={!displayQ} aria-label="Copy quote summary">
            <span aria-hidden>📋</span>
            <span>Copy</span>
          </button>
          <button className="quote-toolbar-btn" onClick={() => window.print()} aria-label="Print quote">
            <span aria-hidden>🖨️</span>
            <span>Print Spec</span>
          </button>
          <button className="quote-toolbar-btn quote-toolbar-btn-reset" onClick={() => dispatch({ type: 'RESET_QUOTE' })} aria-label="Reset quote inputs">
            <span aria-hidden>↺</span>
            <span>Reset</span>
          </button>
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={handleOpenSaveDialog} aria-label="Save quote">
            <span aria-hidden>💾</span>
            <span>Save Quote</span>
          </button>
        </div>
      </div>

      {/* Banner if loaded from saved quote */}
      {activeSavedQuote && (
        <div
          className="saved-quote-banner"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--r-md)',
            padding: '12px 18px',
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
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => dispatch({ type: 'RECALCULATE_SAVED_QUOTE' })}
              >
                🔄 Recalculate with current prices
              </button>
            )}
            <button
              type="button"
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

      <div className="quote-hero-banner">
        <div className="quote-hero-left">
          <div className="quote-hero-tile" aria-hidden>🎂</div>
          <div className="quote-hero-text">
            <h2 className="quote-hero-title">Architectural Tier Assembly</h2>
            <p className="quote-hero-subtitle">
              Configuring {displayQ?.tiers_used ?? 0} active {(displayQ?.tiers_used ?? 0) === 1 ? 'tier' : 'tiers'}. Serving count automatically synced with cutting guides.
            </p>
          </div>
        </div>

        <div className="quote-hero-stats">
          <div className="quote-hero-stat-block">
            <span className="quote-hero-stat-label">Total Portions</span>
            <span className="quote-hero-stat-val">
              {quoteInput.tiers.reduce((acc, t) => {
                const kg = t.size_kg ?? 0;
                if (kg <= 0) return acc;
                const entry = data.size_guide.find(sg => sg.kg === kg);
                return acc + (entry ? entry.servings : 0);
              }, 0)}
            </span>
          </div>
          <span className="quote-hero-divider" />
          <div className="quote-hero-stat-block">
            <span className="quote-hero-stat-label">Active Tiers</span>
            <span className="quote-hero-stat-val" style={{ color: 'var(--accent)' }}>{displayQ?.tiers_used ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="quote-layout-grid">
        {/* Left: Configuration Column */}
        <div className="quote-config-col">
          {/* 1. Tier structure section */}
          <div className="quote-section-card">
            <div className="decorations-section-header">
              <div className="decorations-header-left">
                <span style={{ fontSize: 20 }} aria-hidden>📚</span>
                <h2 className="decorations-header-title">Tier Structure</h2>
              </div>
              <span className="decorations-header-right">
                {displayQ ? `${displayQ.tiers_used} active tier${displayQ.tiers_used !== 1 ? 's' : ''}` : 'Tier 1 required'}
              </span>
            </div>

            <div className="tier-rows-list">
              {Array.from({ length: activeTiers }, (_, idx) => {
                const tier = quoteInput.tiers[idx];
                const res = displayQ?.tier_details?.[idx];
                const isActive = (tier.size_kg ?? 0) > 0;
                const visibleSizeGuide = data.size_guide.slice(0, 4);

                return (
                  <div key={idx} className={`tier-item-row ${isActive ? 'active' : ''}`}>
                    <div className="tier-item-topbar">
                      <div className="tier-item-title-group">
                        <div className="tier-badge-tile" aria-label={`Tier ${idx + 1}`}>
                          {idx + 1}
                        </div>
                        <h3 className="tier-item-heading">
                          Tier {idx + 1}
                          {tier.size_kg ? `: ${data.size_guide.find(sg => sg.kg === tier.size_kg)?.label ?? ''} Tier` : ''}
                        </h3>
                        {isActive && (
                          <span className="tier-portions-pill">
                            {data.size_guide.find(sg => sg.kg === tier.size_kg)?.servings ?? 0} PORTIONS
                          </span>
                        )}
                      </div>

                      {isActive && res && (
                        <div className="tier-cost-chip">
                          {fmt(res.flavour_part + res.filling_part, cur)}
                        </div>
                      )}

                      {idx > 0 && (
                        <button
                          type="button"
                          className="tier-remove-btn"
                          onClick={() => {
                            updateTier(idx, { size_kg: 0, flavour_id: null, filling_id: null });
                            if (idx === activeTiers - 1) setActiveTiers(t => t - 1);
                          }}
                          aria-label={`Remove tier ${idx + 1}`}
                          title={`Remove tier ${idx + 1}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="tier-controls-grid">
                      {/* Size selector */}
                      <div className="tier-control-block">
                        <label className="tier-control-label">Size (kg)</label>
                        <NumberInput
                          value={tier.size_kg ?? 0}
                          onChange={v => updateTier(idx, { size_kg: v })}
                          step={0.1}
                          placeholder="kg"
                          aria-label={`Tier ${idx + 1} size in kg`}
                        />
                        {visibleSizeGuide.length > 0 && (
                          <div className="tier-size-pills-box">
                            {visibleSizeGuide.map(sg => {
                              const isSelected = tier.size_kg === sg.kg;
                              return (
                                <button
                                  key={sg.label}
                                  type="button"
                                  className={`tier-size-pill-btn ${isSelected ? 'active' : ''}`}
                                  onClick={() => updateTier(idx, { size_kg: sg.kg })}
                                  aria-label={`${sg.label} (${sg.servings} servings)`}
                                  title={`${sg.label} (${sg.servings} servings)`}
                                >
                                  {sg.label} [{sg.servings}]
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Flavour selector */}
                      <div className="tier-control-block">
                        <label className="tier-control-label">Flavour</label>
                        <div className="tier-select-wrapper">
                          <select
                            className="tier-custom-select"
                            value={tier.flavour_id ?? ''}
                            onChange={e => updateTier(idx, { flavour_id: e.target.value || null })}
                            aria-label={`Tier ${idx + 1} Flavour`}
                          >
                            <option value="">— pick flavour —</option>
                            {flavourOptions.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <span className="tier-select-chevron" aria-hidden>▾</span>
                        </div>
                      </div>

                      {/* Filling selector */}
                      <div className="tier-control-block">
                        <label className="tier-control-label">Filling</label>
                        <div className="tier-select-wrapper">
                          <select
                            className="tier-custom-select"
                            value={tier.filling_id ?? ''}
                            onChange={e => updateTier(idx, { filling_id: e.target.value || null })}
                            aria-label={`Tier ${idx + 1} Filling`}
                          >
                            <option value="">— pick filling —</option>
                            {fillingOptions.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <span className="tier-select-chevron" aria-hidden>▾</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Add tier slot */}
            {activeTiers < 6 && (
              <div className="add-tier-slot">
                <button
                  type="button"
                  className="btn-add-tier"
                  onClick={() => setActiveTiers(t => Math.min(t + 1, 6))}
                  aria-label="Add another tier"
                >
                  + Add Tier {activeTiers + 1}
                </button>
              </div>
            )}
          </div>

          {/* 3. Decorations & Extras section */}
          <div className="tier-item-row" style={{ gap: 16 }}>
            <div className="decorations-section-header">
              <div className="decorations-header-left">
                <span style={{ fontSize: 20 }} aria-hidden>🎨</span>
                <h2 className="decorations-header-title">Decorations, Materials &amp; Logistics</h2>
              </div>
              <span className="decorations-header-right">All overhead rates active</span>
            </div>

            <div className="decorations-grid">
              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Fondant</span>
                  <span className="decoration-card-icon" aria-hidden>🎂</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">kg</span>
                  <NumberInput
                    id="input-fondant"
                    value={quoteInput.decoration.fondant_kg}
                    onChange={v => updateDecoration('fondant_kg', v)}
                    step={0.1}
                    className="decoration-inline-input"
                    aria-label="Fondant in kg"
                  />
                </div>
              </div>

              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Edible Prints</span>
                  <span className="decoration-card-icon" aria-hidden>🖨️</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">count</span>
                  <NumberInput
                    id="input-prints"
                    value={quoteInput.decoration.prints}
                    onChange={v => updateDecoration('prints', v)}
                    className="decoration-inline-input"
                    aria-label="Edible prints count"
                  />
                </div>
              </div>

              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Sugar Flowers</span>
                  <span className="decoration-card-icon" aria-hidden>🌸</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">{cur}</span>
                  <NumberInput
                    id="input-flowers"
                    value={quoteInput.decoration.flowers}
                    onChange={v => updateDecoration('flowers', v)}
                    className="decoration-inline-input"
                    aria-label="Flowers cost"
                  />
                </div>
              </div>

              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Acrylic Toppers</span>
                  <span className="decoration-card-icon" aria-hidden>🎯</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">count</span>
                  <NumberInput
                    id="input-toppers"
                    value={quoteInput.decoration.toppers}
                    onChange={v => updateDecoration('toppers', v)}
                    className="decoration-inline-input"
                    aria-label="Toppers count"
                  />
                </div>
              </div>

              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Other costs</span>
                  <span className="decoration-card-icon" aria-hidden>🧾</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">{cur}</span>
                  <NumberInput
                    id="input-others"
                    value={quoteInput.decoration.others}
                    onChange={v => updateDecoration('others', v)}
                    className="decoration-inline-input"
                    aria-label="Other costs"
                  />
                </div>
              </div>

              <div className="decoration-card">
                <div className="decoration-card-top">
                  <span className="decoration-card-label">Delivery Run</span>
                  <span className="decoration-card-icon" aria-hidden>🚚</span>
                </div>
                <div className="decoration-card-bottom">
                  <span className="decoration-card-hint">{cur}</span>
                  <NumberInput
                    id="input-delivery"
                    value={quoteInput.decoration.delivery}
                    onChange={v => updateDecoration('delivery', v)}
                    className="decoration-inline-input"
                    aria-label="Delivery cost"
                  />
                </div>
              </div>

              {/* Full-width labour + discount strip */}
              <div className="labour-discount-strip">
                <div className="strip-col">
                  <div className="strip-col-header">
                    <span className="strip-label">Labour Allocation</span>
                    <span className="strip-hint">
                      {quoteInput.decoration.time_hours} hrs @ {settings.labour_rate_per_hour}/{cur}
                    </span>
                  </div>
                  <div className="strip-controls-row">
                    <NumberInput
                      value={quoteInput.decoration.time_hours}
                      onChange={v => updateDecoration('time_hours', v)}
                      step={0.5}
                      aria-label="Labour hours"
                    />
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmt(quoteInput.decoration.time_hours * settings.labour_rate_per_hour, cur)}
                    </span>
                  </div>
                </div>

                <div className="strip-col">
                  <div className="strip-col-header">
                    <span className="strip-label">Promo / Courtesy Discount</span>
                    <span className="strip-hint">
                      {displayQ?.discount_capped ? '⚠ Capped to profit' : 'Custom % applied'}
                    </span>
                  </div>
                  <div className="strip-controls-row">
                    <div className="discount-presets-group">
                      {[0, 25, 50, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          className="discount-preset-chip"
                          onClick={() => {
                            const profit = displayQ?.profit ?? 0;
                            updateDecoration('discount', parseFloat(((profit * pct) / 100).toFixed(2)));
                          }}
                          aria-label={`Apply ${pct}% discount`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                    <div className="discount-input-wrapper">
                      <NumberInput
                        value={quoteInput.decoration.discount ?? 0}
                        onChange={v => updateDecoration('discount', Math.max(0, v))}
                        placeholder="0"
                        aria-label="Discount amount"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Warnings list */}
          {displayQ && displayQ.warnings.length > 0 && (
            <WarningsList warnings={displayQ.warnings} limit={5} />
          )}
        </div>

        {/* Right: Sticky Cost Summary Column */}
        <div className="quote-summary-col">
          {!displayQ ? (
            <div className="summary-card-inner">
              <div className="empty-state" style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎂</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Configure Tier 1</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Enter a size for Tier 1 to view live price calculation
                </div>
              </div>
            </div>
          ) : (
            <div className="summary-card-inner">
              {/* 1. Total Price Hero */}
              <div className="summary-price-box">
                <div className="summary-price-box-header">
                  <span className="summary-price-caption">Total Price</span>
                  <span
                    className={`status-pill ${isMarginMet ? 'status-pill-ready' : 'status-pill-below'}`}
                  >
                    {isMarginMet ? 'Ready' : 'Below Target'}
                  </span>
                </div>

                <div className="summary-price-val">
                  {fmt(displayQ.total_price, cur)}
                </div>

                {/* 2. Suggested Price */}
                {displayQ.suggested_price !== undefined && (
                  <div className="summary-msrp-row">
                    <span className="summary-msrp-label">Suggested Price</span>
                    <span className="summary-msrp-pill">
                      {fmt(displayQ.suggested_price, cur)}
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Cost Attribution Ledger */}
              <div className="summary-ledger-section">
                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: 'var(--accent-amber)' }} />
                    <span>Tier Sponge & Filling</span>
                  </div>
                  <span className="ledger-item-val">{fmt(displayQ.tier_cost, cur)}</span>
                </div>

                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: '#f97316' }} />
                    <span>Decorations & Add-ons</span>
                  </div>
                  <span className="ledger-item-val">{fmt(decorationsTotal, cur)}</span>
                </div>

                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: 'var(--accent-mint)' }} />
                    <span>Production Labour</span>
                  </div>
                  <span className="ledger-item-val">{fmt(displayQ.time, cur)}</span>
                </div>

                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: 'var(--text-muted)' }} />
                    <span>Overhead</span>
                  </div>
                  <span className="ledger-item-val">{fmt(displayQ.overhead, cur)}</span>
                </div>

                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: '#38bdf8' }} />
                    <span>Packaging</span>
                  </div>
                  <span className="ledger-item-val">{fmt(displayQ.packaging, cur)}</span>
                </div>

                <div className="summary-ledger-row">
                  <div className="ledger-item-left">
                    <span className="ledger-dot" style={{ background: '#a855f7' }} />
                    <span>Delivery</span>
                  </div>
                  <span className="ledger-item-val">{fmt(displayQ.delivery, cur)}</span>
                </div>
              </div>

              {/* 4. Profit Gauge */}
              <div className="net-yield-box">
                <div className="net-yield-top">
                  <span className="net-yield-label">Net Yield</span>
                  <span className="net-yield-profit">{fmt(displayQ.profit, cur)}</span>
                </div>

                <div className="net-yield-bar-track">
                  <div
                    className="net-yield-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, marginRatio * 100))}%`,
                      background: isMarginMet ? 'var(--tertiary)' : 'var(--accent)',
                    }}
                  />
                </div>

                <div className="net-yield-footer">
                  <span>Margin: {(displayQ.margin_check * 100).toFixed(1)}%</span>
                  <span>Target: {(settings.target_margin * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* 5. Total Cost Row */}
              <div className="summary-ledger-row">
                <span>Total Cost</span>
                <span className="summary-price-val">{fmt(displayQ.total_cost, cur)}</span>
              </div>

              {/* 6. Inspect Cost Engine Hierarchy Button */}
              <button
                type="button"
                className="btn-inspect-hierarchy"
                onClick={() => setShowExplain(true)}
                aria-label="Inspect Cost Engine Hierarchy"
              >
                <span>🔍 Inspect Cost Engine Hierarchy</span>
              </button>

              {displayQ && displayQ.audit.length > 0 && (
                <div className="formula-ledger-card">
                  <div
                    className="formula-ledger-header"
                    onClick={() => setLedgerOpen(o => !o)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={ledgerOpen}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLedgerOpen(o => !o); } }}
                  >
                    <span className="formula-ledger-title text-label-caps">
                      <span className="text-tertiary">◆</span>
                      <span>Real-Time Formula Ledger</span>
                    </span>
                    <span className="formula-ledger-toggle-icon">{ledgerOpen ? '▾ collapse' : '▸ expand'}</span>
                  </div>
                  {ledgerOpen && (
                    <div className="formula-ledger-list">
                      {displayQ.audit.map((step, i) => (
                        <div key={i} className="formula-entry-card">
                          <span className="formula-entry-label">[{step.label}]</span>
                          <span className="formula-entry-math">
                            {step.formula} = {cur} {step.value.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowSaveDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-dialog-title"
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-header">
              <div id="save-dialog-title" className="card-title">💾 Save Quote</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSaveDialog(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              <div className="form-group">
                <label htmlFor="save-quote-name">Quote Name</label>
                <input
                  id="save-quote-name"
                  type="text"
                  className="input"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder={`Quote ${new Date().toISOString().slice(0, 10)}`}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="save-quote-notes">Notes (optional)</label>
                <textarea
                  id="save-quote-notes"
                  className="input"
                  rows={3}
                  value={saveNotes}
                  onChange={e => setSaveNotes(e.target.value)}
                  placeholder="e.g. Wedding cake for Sarah, floral theme..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSaveDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveQuote}
                >
                  Save Quote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explain Panel */}
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
