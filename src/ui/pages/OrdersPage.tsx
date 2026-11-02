import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Order, OrderStatus } from '../../engine/types';
import { generateId, localDateString } from '../../engine/utils';
import { ConfirmDialog, SearchBar } from '../components/Shared';
import { ShoppingListModal } from '../components/ShoppingListModal';

interface OrdersPageProps {
  onNavigate: (page: string) => void;
}

export function OrdersPage({ onNavigate }: OrdersPageProps) {
  const { state, dispatch } = useStore();
  const { orders, customers, saved_quotes } = state.data;

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<Order | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [shoppingTarget, setShoppingTarget] = useState<(typeof saved_quotes)[number] | null>(null);

  const filtered = useMemo(() => {
    let res = [...orders];
    if (filterStatus !== 'all') {
      res = res.filter(o => o.status === filterStatus);
    }
    if (filterCustomer !== 'all') {
      res = res.filter(o => o.customer_id === filterCustomer);
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      res = res.filter(o => {
        const customerName = customers.find(c => c.id === o.customer_id)?.name ?? '';
        const quoteName = saved_quotes.find(q => q.id === o.quote_id)?.name ?? '';
        return customerName.toLowerCase().includes(query) ||
          quoteName.toLowerCase().includes(query) ||
          (o.notes ?? '').toLowerCase().includes(query);
      });
    }
    return res.sort((a, b) => {
      const aDate = a.order_date || '';
      const bDate = b.order_date || '';
      return bDate.localeCompare(aDate); // descending by order date
    });
  }, [orders, customers, saved_quotes, filterStatus, filterCustomer, search]);

  const openNew = () => {
    setIsNew(true);
    setEditing({
      id: generateId('ord'),
      customer_id: null,
      quote_id: null,
      order_date: localDateString(),
      due_date: '',
      status: 'Draft',
      notes: ''
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    dispatch({ type: isNew ? 'ADD_ORDER' : 'UPDATE_ORDER', item: editing });
    setEditing(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_ORDER', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const handleOpenQuote = (quoteId: string) => {
    const q = saved_quotes.find(x => x.id === quoteId);
    if (q) {
      dispatch({ type: 'LOAD_SAVED_QUOTE', quote: q });
      onNavigate('quote');
    }
  };

  return (
    <>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Records</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Orders</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Orders</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>New Order</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>receipt_long</span>
              <h2 className="decorations-header-title">Order Ledger</h2>
            </div>
            <span className="decorations-header-right">{filtered.length} of {orders.length} orders</span>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search customers, quotes, or notes…" maxWidth={420} />
          <div className="form-row form-row-2" style={{ marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Status Filter</label>
              <select className="select" style={{ width: '100%' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Customer Filter</label>
              <select className="select" style={{ width: '100%' }} value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}>
                <option value="all">All Customers</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>receipt_long</span>
              </div>
              <div className="empty-state-title">
                {search || filterStatus !== 'all' || filterCustomer !== 'all' ? 'No orders found' : 'No orders yet'}
              </div>
              <div className="empty-state-text">
                {search || filterStatus !== 'all' || filterCustomer !== 'all'
                  ? 'Adjust your search or filters'
                  : 'Create your first order to get started'}
              </div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
                <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                <span>Create order</span>
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Quote</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const customer = customers.find(c => c.id === o.customer_id);
                    const quote = saved_quotes.find(q => q.id === o.quote_id);

                    let badgeClass = 'badge-muted';
                    if (o.status === 'Confirmed') badgeClass = 'badge-amber';
                    if (o.status === 'Delivered') badgeClass = 'badge-green';
                    if (o.status === 'Cancelled') badgeClass = 'badge-red';

                    return (
                      <tr key={o.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{customer ? customer.name : <span className="text-muted">No Customer</span>}</div>
                        </td>
                        <td>
                          {quote ? (
                            <div className="order-quote-actions">
                              <button className="quote-toolbar-btn" onClick={() => handleOpenQuote(quote.id)} style={{ maxWidth: 220 }}>
                                <span className="material-symbols-outlined ms-16" aria-hidden>request_quote</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quote.name}</span>
                              </button>
                              <button className="quote-toolbar-btn" onClick={() => setShoppingTarget(quote)} title={`View shopping list for ${quote.name}`} aria-label={`View shopping list for ${quote.name}`}>
                                <span className="material-symbols-outlined ms-16" aria-hidden>grocery</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 12 }}>No Quote</span>
                          )}
                        </td>
                        <td>
                          <div className="text-muted" style={{ fontSize: 12 }}>Ordered: {o.order_date || '—'}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>Due: {o.due_date || '—'}</div>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{o.status}</span>
                        </td>
                        <td>
                          <div className="text-muted" style={{ fontSize: 12, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {o.notes || '—'}
                          </div>
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditing({ ...o }); }} title="Edit order" aria-label="Edit order" style={{ width: 32, height: 32, padding: 0 }}>
                              <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                            </button>
                            <button className="quote-toolbar-btn" onClick={() => setDeleteTarget(o)} title="Delete order" aria-label="Delete order" style={{ width: 32, height: 32, padding: 0 }}>
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
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>{isNew ? 'add' : 'edit'}</span>
                {isNew ? 'New Order' : 'Edit Order'}
              </h2>
              <button type="button" className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Customer</label>
                  <select className="select" style={{ width: '100%' }} value={editing.customer_id || ''} onChange={e => setEditing({ ...editing, customer_id: e.target.value || null })}>
                    <option value="">(None)</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quote</label>
                  <select className="select" style={{ width: '100%' }} value={editing.quote_id || ''} onChange={e => setEditing({ ...editing, quote_id: e.target.value || null })}>
                    <option value="">(None)</option>
                    {saved_quotes.map(q => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label>Order Date</label>
                    <input type="date" className="input" style={{ width: '100%' }} value={editing.order_date || ''} onChange={e => setEditing({ ...editing, order_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input type="date" className="input" style={{ width: '100%' }} value={editing.due_date || ''} onChange={e => setEditing({ ...editing, due_date: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="select" style={{ width: '100%' }} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as OrderStatus })}>
                    <option value="Draft">Draft</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Notes</label>
                  <textarea className="textarea" style={{ width: '100%', height: 60 }} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="quote-toolbar-btn" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="quote-toolbar-btn quote-toolbar-btn-primary">
                  <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                  <span>Save Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message="Are you sure you want to delete this order? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
          danger
        />
      )}
      {shoppingTarget && (
        <ShoppingListModal
          data={state.data}
          quote={shoppingTarget}
          onClose={() => setShoppingTarget(null)}
        />
      )}
    </>
  );
}
