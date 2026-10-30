import { useState } from 'react';
import { useStore } from '../../store/store';
import type { SavedQuote } from '../../engine/types';
import { ConfirmDialog, SearchBar, fmtMoney } from '../components/Shared';

interface SavedQuotesPageProps {
  onNavigate: (page: string) => void;
}

export function SavedQuotesPage({ onNavigate }: SavedQuotesPageProps) {
  const { state, dispatch } = useStore();
  const { saved_quotes, settings } = state.data;
  const cur = settings.currency_code;

  const [deleteTarget, setDeleteTarget] = useState<SavedQuote | null>(null);
  const [search, setSearch] = useState('');

  // Sort descending by created_at date
  const sortedQuotes = [...saved_quotes].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const filteredQuotes = sortedQuotes.filter(q => {
    const query = search.trim().toLowerCase();
    return !query || q.name.toLowerCase().includes(query) || (q.notes ?? '').toLowerCase().includes(query);
  });

  const handleOpen = (quote: SavedQuote, recalculate = false) => {
    dispatch({ type: 'LOAD_SAVED_QUOTE', quote, recalculate });
    onNavigate('quote');
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_SAVED_QUOTE', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const getPrice = (q: SavedQuote): string => {
    const snap = q.result_snapshot as any;
    if (snap && typeof snap.total_price === 'number') {
      return fmtMoney(snap.total_price, cur);
    }
    return '—';
  };

  const getTiersSummary = (q: SavedQuote): string => {
    if (q.kind === 'products') {
      const lines = q.product_quote_input?.lines ?? [];
      if (!lines.length) return '0 product lines';
      return `${lines.length} line${lines.length > 1 ? 's' : ''}`;
    }
    const activeTiers = (q.input?.tiers || []).filter(t => (t.size_kg ?? 0) > 0);
    const count = activeTiers.length;
    if (count === 0) return '0 tiers';
    const totalKg = activeTiers.reduce((acc, t) => acc + (t.size_kg || 0), 0);
    return `${count} tier${count > 1 ? 's' : ''} (${totalKg.toFixed(1)} kg)`;
  };

  const getKindBadge = (q: SavedQuote): string => q.kind === 'products' ? 'Product Quote' : 'Cake Quote';

  return (
    <>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Quote Studio</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Saved Quotes</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Saved Quotes</h1>
            {saved_quotes.length > 0 && (
              <span className="badge badge-accent" style={{ fontSize: 12 }}>
                {saved_quotes.length}
              </span>
            )}
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => onNavigate('quote')}>
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>New Quote</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>folder_open</span>
              <h2 className="decorations-header-title">Saved Quote Archive</h2>
            </div>
            <span className="decorations-header-right">{filteredQuotes.length} of {saved_quotes.length} quotes</span>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search quote names or notes…" maxWidth={420} />
          {filteredQuotes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>folder_open</span>
              </div>
              <div className="empty-state-title">{search ? 'No quotes found' : 'No saved quotes yet'}</div>
              <div className="empty-state-text">
                {search
                  ? 'Try a different search term'
                  : 'Configure a cake on the Quote page and click "Save quote" to snapshot it and revisit or recalculate later.'}
              </div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => onNavigate('quote')}>
                <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                <span>Create Cake Quote</span>
              </button>
            </div>
          ) : (
            <>
              <div className="saved-quotes-table-container">
                <div className="table-wrapper">
                  <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date Saved</th>
                      <th>Tiers</th>
                      <th style={{ textAlign: 'right' }}>Saved Price</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(sq => (
                      <tr key={sq.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleOpen(sq, false)}
                            title="Click to open quote"
                            style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', font: 'inherit', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
                          >
                            {sq.name}
                          </button>
                          <div className="badge badge-muted" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>{getKindBadge(sq)}</div>
                          {sq.notes && (
                            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                              {sq.notes}
                            </div>
                          )}
                        </td>
                        <td className="text-secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          {new Date(sq.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="text-secondary" style={{ fontSize: 13 }}>{getTiersSummary(sq)}</td>
                        <td className="td-mono text-green" style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {getPrice(sq)}
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="quote-toolbar-btn" onClick={() => handleOpen(sq, false)} title="Open quote with saved price snapshot">
                              <span className="material-symbols-outlined ms-16" aria-hidden>folder_open</span>
                              <span>Open</span>
                            </button>
                            <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => handleOpen(sq, true)} title="Recalculate this quote with current catalogue prices">
                              <span className="material-symbols-outlined ms-16" aria-hidden>sync</span>
                              <span>Recalculate</span>
                            </button>
                            <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0, color: 'var(--accent-red)' }} onClick={() => setDeleteTarget(sq)} title="Delete quote" aria-label={`Delete quote ${sq.name}`}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>

              <div className="saved-quotes-cards-container" style={{ gap: 12 }}>
                {filteredQuotes.map(sq => (
                <div key={sq.id} className="saved-quote-card quote-section-card" style={{ gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleOpen(sq, false)}
                        title="Click to open quote"
                        style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', font: 'inherit', fontWeight: 600, fontSize: 15, textAlign: 'left', cursor: 'pointer' }}
                      >
                        {sq.name}
                      </button>
                      <div className="badge badge-muted" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>{getKindBadge(sq)}</div>
                      <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
                        {new Date(sq.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })} · {getTiersSummary(sq)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="td-mono text-green" style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {getPrice(sq)}
                      </div>
                      <span className="badge badge-muted" style={{ fontSize: 10 }}>Saved Price</span>
                    </div>
                  </div>

                  {sq.notes && (
                    <div className="text-muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
                      {sq.notes}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="quote-toolbar-btn" style={{ flex: 1 }} onClick={() => handleOpen(sq, false)}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>folder_open</span>
                      <span>Open</span>
                    </button>
                    <button className="quote-toolbar-btn quote-toolbar-btn-primary" style={{ flex: 1 }} onClick={() => handleOpen(sq, true)}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>sync</span>
                      <span>Recalculate</span>
                    </button>
                    <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0, color: 'var(--accent-red)', flexShrink: 0 }} onClick={() => setDeleteTarget(sq)} title="Delete quote" aria-label={`Delete quote ${sq.name}`}>
                      <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                    </button>
                  </div>
                </div>
                ))}
              </div>
            </>)}
          </div>
        </div>

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete Quote"
          danger
        />
      )}
    </>
  );
}
