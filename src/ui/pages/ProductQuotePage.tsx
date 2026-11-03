import { useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { computeProductQuote } from '../../engine/engine';
import type { ProductQuoteLine, SavedQuote } from '../../engine/types';
import { localDateString } from '../../engine/utils';
import { NumberInput, fmtMoney } from '../components/Shared';

const emptyLine = (batchFirstId: string): ProductQuoteLine => ({
  product_kind: 'batch',
  product_id: batchFirstId,
  quantity: 1,
  unit: 'piece',
  price_override: null,
});

export function ProductQuotePage() {
  const { state, dispatch } = useStore();
  const { data, productQuoteInput } = state;
  const cur = data.settings.currency_code;

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNotes, setSaveNotes] = useState('');
  const result = useMemo(() => computeProductQuote(data, productQuoteInput), [data, productQuoteInput]);

  const batchOptions = useMemo(() => [...data.batch_products].sort((a, b) => a.name.localeCompare(b.name)), [data.batch_products]);
  const assembledOptions = useMemo(() => [...data.assembled_products].sort((a, b) => a.name.localeCompare(b.name)), [data.assembled_products]);

  const updateLine = (idx: number, patch: Partial<ProductQuoteLine>) => {
    dispatch({
      type: 'SET_PRODUCT_QUOTE_INPUT',
      input: {
        ...productQuoteInput,
        lines: productQuoteInput.lines.map((line, i) => i === idx ? { ...line, ...patch } : line),
      },
    });
  };

  const addLine = () => {
    const fallbackProductId = batchOptions[0]?.id ?? assembledOptions[0]?.id ?? '';
    dispatch({
      type: 'SET_PRODUCT_QUOTE_INPUT',
      input: {
        ...productQuoteInput,
        lines: [...productQuoteInput.lines, emptyLine(fallbackProductId)],
      },
    });
  };

  const removeLine = (idx: number) => {
    dispatch({
      type: 'SET_PRODUCT_QUOTE_INPUT',
      input: {
        ...productQuoteInput,
        lines: productQuoteInput.lines.filter((_, i) => i !== idx),
      },
    });
  };

  const saveQuote = () => {
    const now = new Date().toISOString();
    const quoteToSave: SavedQuote = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pq-${Date.now()}`,
      name: saveName.trim() || `Product Quote ${localDateString()}`,
      created_at: now,
      updated_at: now,
      kind: 'products',
      input: {
        tiers: [],
        decoration: {
          fondant_kg: 0,
          prints: 0,
          flowers: 0,
          toppers: 0,
          time_hours: 0,
          others: 0,
          delivery: 0,
          discount: 0,
        },
      },
      product_quote_input: {
        ...productQuoteInput,
        lines: productQuoteInput.lines.map(line => ({
          ...line,
          unit: line.product_kind === 'assembled' ? 'piece' : line.unit,
        })),
      },
      result_snapshot: { ...result },
      notes: saveNotes.trim() || undefined,
    };

    dispatch({ type: 'ADD_SAVED_QUOTE', item: quoteToSave });
    setShowSaveDialog(false);
  };

  const lineOptions = (kind: 'batch' | 'assembled') => kind === 'batch' ? batchOptions : assembledOptions;

  return (
    <div className="quote-page-root">
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Quote</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Product Quote</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Product Quote</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => setShowSaveDialog(true)}>
            <span className="material-symbols-outlined ms-18" aria-hidden>save</span>
            <span>Save Quote</span>
          </button>
          <button type="button" className="quote-toolbar-btn" onClick={() => dispatch({ type: 'RESET_PRODUCT_QUOTE' })}>
            <span className="material-symbols-outlined ms-18" aria-hidden>restart_alt</span>
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="product-quote-layout">
        <section className="quote-section-card product-quote-products">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>inventory_2</span>
              <h2 className="decorations-header-title">Products</h2>
            </div>
            <button type="button" className="quote-toolbar-btn" onClick={addLine}>
              <span className="material-symbols-outlined ms-16" aria-hidden>add</span>
              <span>Add line</span>
            </button>
          </div>

          {productQuoteInput.lines.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No product lines yet</div>
              <div className="empty-state-text">Add a batch or assembled product to build a product quote.</div>
            </div>
          ) : (
            <div className="product-quote-lines">
              {productQuoteInput.lines.map((line, idx) => {
                const options = lineOptions(line.product_kind);
                return (
                  <div key={`${line.product_kind}-${idx}`} className="product-quote-line">
                    <div className="product-quote-line-primary">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Type</label>
                        <select className="select" value={line.product_kind} onChange={e => updateLine(idx, { product_kind: e.target.value as 'batch' | 'assembled', product_id: lineOptions(e.target.value as 'batch' | 'assembled')[0]?.id ?? '', unit: 'piece' })}>
                          <option value="batch">Batch</option>
                          <option value="assembled">Assembled</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Product</label>
                        <select className="select" value={line.product_id} onChange={e => updateLine(idx, { product_id: e.target.value })}>
                          {options.length === 0 ? <option value="">No products</option> : options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Quantity</label>
                        <NumberInput value={line.quantity} onChange={v => updateLine(idx, { quantity: v })} min={0} step={1} />
                      </div>
                      <button type="button" className="quote-toolbar-btn" onClick={() => removeLine(idx)} style={{ width: 32, height: 32, padding: 0 }} aria-label="Remove line">
                        <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                      </button>
                    </div>
                    <div className="product-quote-line-secondary">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Unit</label>
                        <select className="select" value={line.product_kind === 'assembled' ? 'piece' : line.unit} onChange={e => updateLine(idx, { unit: e.target.value as 'piece' | 'box' })}>
                          <option value="piece">Piece</option>
                          <option value="box" disabled={line.product_kind !== 'batch'}>Box</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Price override ({cur})</label>
                        <input
                          type="number"
                          className="input"
                          value={line.price_override !== null && line.price_override !== undefined ? line.price_override : ''}
                          placeholder="Use default"
                          min={0}
                          step={0.01}
                          onChange={e => {
                            const val = e.target.value.trim();
                            updateLine(idx, { price_override: val === '' ? null : Number(val) });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="quote-section-card product-quote-summary">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>receipt_long</span>
              <h2 className="decorations-header-title">Summary</h2>
            </div>
          </div>

          <div className="product-quote-metrics">
            <div className="product-quote-metric"><span>Subtotal</span><b>{fmtMoney(result.subtotal, cur)}</b></div>
            <div className="product-quote-metric"><span>Cost total</span><b>{fmtMoney(result.cost_total, cur)}</b></div>
            <div className="product-quote-metric"><span>Discount</span><b>-{fmtMoney(result.discount, cur)}</b></div>
            <div className="product-quote-metric"><span>Delivery</span><b>{fmtMoney(result.delivery, cur)}</b></div>
            <div className="product-quote-metric product-quote-metric-total"><span>Total</span><b>{fmtMoney(result.total_price, cur)}</b></div>
            <div className="product-quote-metric"><span>Profit</span><b>{fmtMoney(result.profit, cur)}</b></div>
            <div className="product-quote-metric"><span>Effective margin</span><b>{(result.effective_margin * 100).toFixed(1)}%</b></div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Delivery ({cur})</label>
            <input
              type="number"
              className="input"
              min={0}
              step={0.01}
              value={productQuoteInput.delivery}
              onChange={e => dispatch({
                type: 'SET_PRODUCT_QUOTE_INPUT',
                input: { ...productQuoteInput, delivery: Number(e.target.value || 0) },
              })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Discount ({cur})</label>
            <input
              type="number"
              className="input"
              min={0}
              step={0.01}
              value={productQuoteInput.discount ?? 0}
              onChange={e => dispatch({
                type: 'SET_PRODUCT_QUOTE_INPUT',
                input: { ...productQuoteInput, discount: Number(e.target.value || 0) },
              })}
            />
          </div>

          {result.warnings.length > 0 && (
            <div className="warning-stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.warnings.map((warning, i) => (
                <div key={`${warning.code}-${i}`} className={warning.code === 'W_PRICE_BELOW_COST' ? 'badge badge-red' : 'badge badge-amber'}>
                  {warning.context}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showSaveDialog && (
        <div className="modal-backdrop" onClick={() => setShowSaveDialog(false)} role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Save product quote</h2>
              <button type="button" className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setShowSaveDialog(false)} aria-label="Close"> 
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Quote Name</label>
                <input className="input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Product quote" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="input" rows={3} value={saveNotes} onChange={e => setSaveNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="quote-toolbar-btn" onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={saveQuote}>Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
