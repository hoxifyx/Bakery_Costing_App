import { useState } from 'react';
import { useStore } from '../../store/store';
import type { SavedQuote } from '../../engine/types';

interface SavedQuotesPageProps {
  onNavigate: (page: string) => void;
}

function fmt(n: number, cur: string): string {
  return `${cur} ${n.toFixed(2)}`;
}

export function SavedQuotesPage({ onNavigate }: SavedQuotesPageProps) {
  const { state, dispatch } = useStore();
  const { saved_quotes, settings } = state.data;
  const cur = settings.currency_code;

  const [deleteTarget, setDeleteTarget] = useState<SavedQuote | null>(null);

  // Sort descending by created_at date
  const sortedQuotes = [...saved_quotes].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
      return fmt(snap.total_price, cur);
    }
    return '—';
  };

  const getTiersSummary = (q: SavedQuote): string => {
    const activeTiers = (q.input?.tiers || []).filter(t => (t.size_kg ?? 0) > 0);
    const count = activeTiers.length;
    if (count === 0) return '0 tiers';
    const totalKg = activeTiers.reduce((acc, t) => acc + (t.size_kg || 0), 0);
    return `${count} tier${count > 1 ? 's' : ''} (${totalKg.toFixed(1)} kg)`;
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="page-title gradient-text">Saved Quotes</h1>
              <span className="badge badge-accent" style={{ fontSize: 12 }}>
                {saved_quotes.length}
              </span>
            </div>
            <p className="page-subtitle">
              Browse, reopen, and recalculate your saved cake quotes with current prices
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onNavigate('quote')}
          >
            + New Quote
          </button>
        </div>
      </div>

      <div className="page-body">
        {sortedQuotes.length === 0 ? (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-primary)' }}>
              No saved quotes yet
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 20px', fontSize: 13 }}>
              Configure a cake on the Quote page and click "Save quote" to snapshot it and revisit or recalculate later.
            </p>
            <button className="btn btn-primary" onClick={() => onNavigate('quote')}>
              Create Cake Quote
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Desktop Table View */}
            <div className="saved-quotes-table-container">
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '14px 18px' }}>Quote Name</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px' }}>Date Saved</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px' }}>Tiers</th>
                    <th style={{ textAlign: 'right', padding: '14px 18px' }}>Saved Price</th>
                    <th style={{ textAlign: 'right', padding: '14px 18px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuotes.map(sq => (
                    <tr
                      key={sq.id}
                      style={{
                        borderTop: '1px solid var(--border)',
                        transition: 'background 120ms ease',
                      }}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleOpen(sq, false)}
                          title="Click to open quote"
                        >
                          {sq.name}
                        </div>
                        {sq.notes && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {sq.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {new Date(sq.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {getTiersSummary(sq)}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                        {getPrice(sq)}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpen(sq, false)}
                            title="Open quote with saved price snapshot"
                          >
                            Open
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpen(sq, true)}
                            title="Recalculate this quote with current catalogue prices"
                          >
                            🔄 Recalculate
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--accent-red)' }}
                            onClick={() => setDeleteTarget(sq)}
                            title="Delete quote"
                            aria-label={`Delete quote ${sq.name}`}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="saved-quotes-cards-container">
              {sortedQuotes.map(sq => (
                <div
                  key={sq.id}
                  className="saved-quote-card"
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div
                        style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', cursor: 'pointer' }}
                        onClick={() => handleOpen(sq, false)}
                      >
                        {sq.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(sq.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })} • {getTiersSummary(sq)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                        {getPrice(sq)}
                      </div>
                      <span className="badge badge-secondary" style={{ fontSize: 10 }}>Saved Price</span>
                    </div>
                  </div>

                  {sq.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                      {sq.notes}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleOpen(sq, false)}
                    >
                      Open
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleOpen(sq, true)}
                    >
                      🔄 Recalculate
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--accent-red)' }}
                      onClick={() => setDeleteTarget(sq)}
                      aria-label={`Delete quote ${sq.name}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
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
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 400, background: 'var(--bg-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-header">
              <div className="card-title">Delete Saved Quote?</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 20px' }}>
              Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
                onClick={confirmDelete}
              >
                Delete Quote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
