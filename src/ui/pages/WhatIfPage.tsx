import { useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { computeWhatIf } from '../../engine';
import type { WhatIfSource, WhatIfUnit } from '../../engine/whatif';
import { ExplainPanel } from '../components/ExplainPanel';
import { NumberInput, fmtMoney } from '../components/Shared';
import { WarningsList } from '../components/WarningsList';

type OptionalNumber = number | null;

function availableUnits(source: WhatIfSource, isCake: boolean): WhatIfUnit[] {
  if (source === 'recipe') return isCake ? ['batch', 'kg'] : ['batch'];
  if (source === 'batch_product') return ['piece', 'box'];
  return ['piece'];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

export function WhatIfPage() {
  const { state } = useStore();
  const { data } = state;
  const currency = data.settings.currency_code;

  const [source, setSource] = useState<WhatIfSource>('recipe');
  const [itemId, setItemId] = useState(data.recipes[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<WhatIfUnit>('batch');
  const [marginOverride, setMarginOverride] = useState<OptionalNumber>(null);
  const [overheadOverride, setOverheadOverride] = useState<OptionalNumber>(null);
  const [labourRateOverride, setLabourRateOverride] = useState<OptionalNumber>(null);
  const [batchMultiplier, setBatchMultiplier] = useState(1);
  const [showExplain, setShowExplain] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const items = useMemo(() => {
    if (source === 'recipe') return [...data.recipes].sort((a, b) => a.name.localeCompare(b.name));
    if (source === 'batch_product') return [...data.batch_products].sort((a, b) => a.name.localeCompare(b.name));
    return [...data.assembled_products].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.recipes, data.batch_products, data.assembled_products, source]);
  const selectedRecipe = source === 'recipe'
    ? data.recipes.find(recipe => recipe.id === itemId)
    : undefined;
  const units = availableUnits(source, selectedRecipe?.kind === 'cake');

  const result = useMemo(() => computeWhatIf(data, {
    source,
    itemId,
    quantity,
    unit,
    ...(marginOverride !== null ? { marginOverride: marginOverride / 100 } : {}),
    ...(overheadOverride !== null ? { overheadOverride: overheadOverride / 100 } : {}),
    ...(labourRateOverride !== null ? { labourRateOverride } : {}),
    ...(source === 'recipe' ? { batchMultiplier } : {}),
  }), [
    data,
    source,
    itemId,
    quantity,
    unit,
    marginOverride,
    overheadOverride,
    labourRateOverride,
    batchMultiplier,
  ]);
  const itemName = items.find(item => item.id === itemId)?.name ?? itemId;

  const changeSource = (nextSource: WhatIfSource) => {
    const nextItems = nextSource === 'recipe'
      ? data.recipes
      : nextSource === 'batch_product'
        ? data.batch_products
        : data.assembled_products;
    const nextItem = nextItems[0];
    setSource(nextSource);
    setItemId(nextItem?.id ?? '');
    setUnit(nextSource === 'recipe' ? 'batch' : 'piece');
  };

  const changeItem = (nextId: string) => {
    setItemId(nextId);
    if (source === 'recipe') {
      const recipe = data.recipes.find(candidate => candidate.id === nextId);
      if (unit === 'kg' && recipe?.kind !== 'cake') setUnit('batch');
    }
  };

  const copySummary = async () => {
    const text = [
      `What-if: ${itemName}`,
      `Price: ${fmtMoney(result.unitPrice, currency)} / ${unit}`,
      `Quantity: ${quantity} ${unit}${quantity === 1 ? '' : 's'}`,
      `Total: ${fmtMoney(result.totalPrice, currency)}`,
      `Effective margin: ${(result.effectiveMargin * 100).toFixed(1)}%`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Summary copied to clipboard.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? `Could not copy summary: ${error.message}` : 'Could not copy summary.');
    }
  };

  return (
    <div className="quote-page-root what-if-page">
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Tools</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">What-if</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">What-if scratchpad</h1>
          </div>
        </div>
      </div>

      <div className="what-if-layout">
        <section className="quote-section-card what-if-controls" aria-labelledby="what-if-controls-title">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>analytics</span>
              <h2 id="what-if-controls-title" className="decorations-header-title">Scenario</h2>
            </div>
          </div>

          <div className="what-if-input-grid">
            <div className="form-group">
              <label htmlFor="what-if-source">Source</label>
              <select id="what-if-source" className="select" value={source} onChange={event => changeSource(event.target.value as WhatIfSource)}>
                <option value="recipe">Recipe</option>
                <option value="batch_product">Batch product</option>
                <option value="assembled_product">Assembled product</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="what-if-item">Item</label>
              <select id="what-if-item" className="select" value={itemId} onChange={event => changeItem(event.target.value)}>
                {items.length === 0
                  ? <option value="">No items available</option>
                  : items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="what-if-quantity">Quantity</label>
              <NumberInput id="what-if-quantity" value={quantity} onChange={setQuantity} min={0} step={1} />
            </div>
            <div className="form-group">
              <label htmlFor="what-if-unit">Unit</label>
              <select id="what-if-unit" className="select" value={unit} onChange={event => setUnit(event.target.value as WhatIfUnit)}>
                {units.map(option => <option key={option} value={option}>{option === 'batch' ? 'Batch' : option === 'kg' ? 'Kilogram (kg)' : option === 'box' ? 'Box' : 'Piece'}</option>)}
              </select>
            </div>
            {source === 'recipe' && (
              <div className="form-group">
                <label htmlFor="what-if-batch-multiplier">Batch multiplier</label>
                <NumberInput
                  id="what-if-batch-multiplier"
                  value={batchMultiplier}
                  onChange={setBatchMultiplier}
                  min={0}
                  step={0.1}
                  aria-label="Batch multiplier (preview only)"
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="what-if-margin">Margin override (%)</label>
              <input
                id="what-if-margin"
                type="number"
                className="input"
                value={marginOverride ?? ''}
                onChange={event => {
                  const value = event.target.value.trim();
                  setMarginOverride(value === '' ? null : Number(value));
                }}
                min={0}
                max={99.9}
                step={0.1}
                placeholder={(data.settings.target_margin * 100).toString()}
              />
              <span className="input-hint">Blank uses the current applicable margin ({formatPercent(
                selectedRecipe?.kind === 'cake' || source === 'recipe'
                  ? data.settings.target_margin
                  : (source === 'batch_product'
                    ? data.batch_products.find(product => product.id === itemId)?.target_margin
                    : data.assembled_products.find(product => product.id === itemId)?.target_margin) ?? data.settings.target_margin,
              )}).</span>
            </div>
            <div className="form-group">
              <label htmlFor="what-if-overhead">Overhead override (%)</label>
              <input
                id="what-if-overhead"
                type="number"
                className="input"
                value={overheadOverride ?? ''}
                onChange={event => {
                  const value = event.target.value.trim();
                  setOverheadOverride(value === '' ? null : Number(value));
                }}
                min={0}
                step={0.1}
                placeholder={(data.settings.overhead_pct * 100).toString()}
              />
            </div>
            <div className="form-group">
              <label htmlFor="what-if-labour">Labour rate override ({currency}/hour)</label>
              <input
                id="what-if-labour"
                type="number"
                className="input"
                value={labourRateOverride ?? ''}
                onChange={event => {
                  const value = event.target.value.trim();
                  setLabourRateOverride(value === '' ? null : Number(value));
                }}
                min={0}
                step={1}
                placeholder={String(data.settings.labour_rate_per_hour)}
              />
            </div>
          </div>
        </section>

        <aside className="quote-section-card what-if-results" aria-labelledby="what-if-results-title">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>calculate</span>
              <h2 id="what-if-results-title" className="decorations-header-title">Results</h2>
            </div>
          </div>
          <p className="what-if-scratchpad-note">This is a scratchpad. Nothing here is saved.</p>

          {Object.entries(result.displacedOverrides).map(([key, values]) => {
            if (!values) return null;
            const label = key === 'labourRate' ? 'Labour rate' : key[0].toUpperCase() + key.slice(1);
            const previous = values.productValue !== null
              ? `product ${key === 'labourRate' ? fmtMoney(values.productValue, currency) : formatPercent(values.productValue)}`
              : `global ${key === 'labourRate' ? fmtMoney(values.globalValue, currency) : formatPercent(values.globalValue)}`;
            const next = key === 'labourRate'
              ? fmtMoney(labourRateOverride ?? 0, currency)
              : formatPercent(key === 'margin' ? (marginOverride ?? 0) / 100 : (overheadOverride ?? 0) / 100);
            return <div key={key} className="what-if-displaced-badge">{label}: {previous} → {next}</div>;
          })}

          <div className="what-if-result-metrics" aria-live="polite">
            <div><span>Unit cost</span><strong>{fmtMoney(result.unitCost, currency)}</strong></div>
            <div><span>Unit price</span><strong>{fmtMoney(result.unitPrice, currency)}</strong></div>
            <div><span>Total cost</span><strong>{fmtMoney(result.totalCost, currency)}</strong></div>
            <div className="what-if-total"><span>Total for {quantity} {unit}{quantity === 1 ? '' : 's'}</span><strong>{fmtMoney(result.totalPrice, currency)}</strong></div>
            <div><span>Effective margin</span><strong>{(result.effectiveMargin * 100).toFixed(1)}%</strong></div>
          </div>

          <div className="what-if-result-actions">
            <button type="button" className="quote-toolbar-btn" onClick={() => setShowExplain(true)} disabled={items.length === 0}>
              <span className="material-symbols-outlined ms-16" aria-hidden>account_tree</span>
              <span>Explain</span>
            </button>
            <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => void copySummary()}>
              <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
              <span>Copy summary</span>
            </button>
          </div>
          <div className="what-if-copy-status" aria-live="polite">{copyStatus}</div>
          {result.warnings.length > 0 && <WarningsList warnings={result.warnings} limit={4} />}
        </aside>
      </div>

      {showExplain && (
        <ExplainPanel
          title={itemName || 'What-if'}
          audit={result.audit}
          currency={currency}
          onClose={() => setShowExplain(false)}
        />
      )}
    </div>
  );
}
