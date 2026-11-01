import { useEffect, useMemo, useRef, useState } from 'react';
import { computeShoppingList } from '../../engine';
import type { AppData, SavedQuote } from '../../engine/types';
import { csvEscape } from '../../io/io';

interface ShoppingListModalProps {
  data: AppData;
  quote: SavedQuote;
  onClose: () => void;
}

type ShoppingTab = 'ingredients' | 'packaging';

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function ShoppingListModal({ data, quote, onClose }: ShoppingListModalProps) {
  const [activeTab, setActiveTab] = useState<ShoppingTab | null>('ingredients');
  const [exportMessage, setExportMessage] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const list = useMemo(() => computeShoppingList(data, quote), [data, quote]);
  const ingredientRows = useMemo(() => [
    ...list.ingredients.map(item => ({ kind: 'item' as const, id: item.id, name: item.name, item })),
    ...list.warnings
      .filter(warning => warning.category === 'ingredient')
      .map(warning => ({ kind: 'warning' as const, id: warning.id, name: warning.name, warning })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [list]);
  const packagingRows = useMemo(() => [
    ...list.packaging.map(item => ({ kind: 'item' as const, id: item.id, name: item.name, item })),
    ...list.warnings
      .filter(warning => warning.category === 'packaging')
      .map(warning => ({ kind: 'warning' as const, id: warning.id, name: warning.name, warning })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [list]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = document.querySelector<HTMLElement>('.shopping-list-modal');
      const focusable = modal?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const exportCsv = () => {
    const headers = ['type', 'name', 'grams', 'pieces', 'gram_equivalent', 'teaspoons', 'converted_from_tsp', 'packaging_quantity', 'production_pieces', 'warning'];
    const rows: unknown[][] = [
      ...list.ingredients.map(item => [
        'ingredient',
        item.name,
        formatQuantity(item.grams),
        formatQuantity(item.pieces),
        formatQuantity(item.gramEquivalent),
        formatQuantity(item.teaspoons),
        item.converted ? 'yes' : 'no',
        '',
        '',
        '',
      ]),
      ...list.packaging.map(item => ['packaging', item.name, '', '', '', '', '', formatQuantity(item.quantity), '', '']),
      ...list.production.map(item => ['production', item.name, '', '', '', '', '', '', formatQuantity(item.pieces), '']),
      ...list.warnings.map(item => ['warning', item.name, '', '', '', '', '', '', '', item.message]),
    ];
    const csv = [headers.join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${quote.name.replace(/[^a-z0-9_-]+/gi, '_') || 'shopping-list'}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportMessage('CSV exported.');
    } catch (error) {
      setExportMessage(error instanceof Error ? `CSV export failed: ${error.message}` : 'CSV export failed.');
    }
  };

  const tabs: { id: ShoppingTab; title: string; count: number }[] = [
    { id: 'ingredients', title: 'Ingredients', count: list.ingredients.length },
    { id: 'packaging', title: 'Packaging', count: list.packaging.length },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-lg shopping-list-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shopping-list-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="shopping-list-title">Shopping list: {quote.name}</h2>
            <p className="shopping-list-subtitle">Computed from the saved quote and current catalogue; nothing is saved.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="quote-toolbar-btn" onClick={onClose} aria-label="Close shopping list">
            <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
          </button>
        </div>

        <div className="modal-body">
          {list.production.length > 0 && (
            <section className="shopping-list-section">
              <h3>Production quantities</h3>
              <div className="shopping-list-table-wrap">
                <table className="shopping-list-table">
                  <thead><tr><th>Product</th><th>Type</th><th>Pieces to make</th></tr></thead>
                  <tbody>
                    {list.production.map(item => (
                      <tr key={`${item.productKind}:${item.id}`}>
                        <td data-label="Product">{item.name}</td>
                        <td data-label="Type">{item.productKind === 'batch' ? 'Batch product' : 'Assembled product'}</td>
                        <td data-label="Pieces to make">{formatQuantity(item.pieces)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="shopping-list-tabs" role="tablist" aria-label="Shopping list categories">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                id={`shopping-tab-${tab.id}`}
                className={`shopping-list-tab${activeTab === tab.id ? ' active' : ''}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-expanded={activeTab === tab.id}
                aria-controls={`shopping-panel-${tab.id}`}
                onClick={() => setActiveTab(current => current === tab.id ? null : tab.id)}
              >
                <span>{tab.title}</span>
                <span className="badge badge-muted">{tab.count}</span>
              </button>
            ))}
          </div>

          {activeTab === 'ingredients' && (
            <section className="shopping-list-panel" id="shopping-panel-ingredients" role="tabpanel" aria-labelledby="shopping-tab-ingredients">
              {ingredientRows.length === 0 ? <p className="text-muted">No ingredient quantities.</p> : (
                <div className="shopping-list-table-wrap">
                  <table className="shopping-list-table">
                    <thead><tr><th>Ingredient</th><th>Grams</th><th>Pieces</th><th>Gram equivalent</th><th>Unconverted tsp</th></tr></thead>
                    <tbody>
                      {ingredientRows.map(row => row.kind === 'warning' ? (
                        <tr key={row.id} className="shopping-list-warning-row">
                          <td colSpan={5} data-label="Warning">
                            <div className="warning-banner"><span aria-hidden>⚠️</span><span><strong>{row.warning.name}:</strong> {row.warning.message}</span></div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td data-label="Ingredient">
                            {row.item.name}
                            {row.item.converted && <span className="shopping-converted"> (converted)</span>}
                          </td>
                          <td data-label="Grams">{row.item.grams > 0 ? `${formatQuantity(row.item.grams)} g` : '—'}</td>
                          <td data-label="Pieces">{row.item.pieces > 0 ? formatQuantity(row.item.pieces) : '—'}</td>
                          <td data-label="Gram equivalent">{row.item.gramEquivalent > 0 ? `${formatQuantity(row.item.gramEquivalent)} g` : '—'}</td>
                          <td data-label="Unconverted tsp">{row.item.teaspoons > 0 ? `${formatQuantity(row.item.teaspoons)} tsp` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'packaging' && (
            <section className="shopping-list-panel" id="shopping-panel-packaging" role="tabpanel" aria-labelledby="shopping-tab-packaging">
              {packagingRows.length === 0 ? <p className="text-muted">No packaging quantities.</p> : (
                <div className="shopping-list-table-wrap">
                  <table className="shopping-list-table">
                    <thead><tr><th>Packaging item</th><th>Quantity</th></tr></thead>
                    <tbody>
                      {packagingRows.map(row => row.kind === 'warning' ? (
                        <tr key={row.id} className="shopping-list-warning-row">
                          <td colSpan={2} data-label="Warning">
                            <div className="warning-banner"><span aria-hidden>⚠️</span><span><strong>{row.warning.name}:</strong> {row.warning.message}</span></div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.id}>
                          <td data-label="Packaging item">{row.item.name}</td>
                          <td data-label="Quantity">{formatQuantity(row.item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {list.warnings.some(warning => warning.category === 'general') && (
            <section className="shopping-list-warnings" aria-label="Shopping list warnings">
              <h3>Warnings</h3>
              {list.warnings.filter(warning => warning.category === 'general').map(warning => (
                <div className="warning-banner" key={warning.id}>
                  <span aria-hidden>⚠️</span>
                  <span><strong>{warning.name}:</strong> {warning.message}</span>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="modal-footer shopping-list-footer">
          <span className="shopping-export-message" role="status">{exportMessage}</span>
          <button type="button" className="quote-toolbar-btn" onClick={onClose}>Close</button>
          <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={exportCsv}>
            <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
}
