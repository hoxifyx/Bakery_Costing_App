import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Order, OrderStatus } from '../../engine/types';
import { generateId } from '../../engine/utils';

interface OrdersPageProps {
  onNavigate: (page: string) => void;
}

export function OrdersPage({ onNavigate }: OrdersPageProps) {
  const { state, dispatch } = useStore();
  const { orders, customers, saved_quotes } = state.data;
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  
  const [editing, setEditing] = useState<Order | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    let res = orders;
    if (filterStatus !== 'all') {
      res = res.filter(o => o.status === filterStatus);
    }
    if (filterCustomer !== 'all') {
      res = res.filter(o => o.customer_id === filterCustomer);
    }
    return res.sort((a, b) => {
      const aDate = a.order_date || '';
      const bDate = b.order_date || '';
      return bDate.localeCompare(aDate); // descending by order date
    });
  }, [orders, filterStatus, filterCustomer]);

  const openNew = () => {
    setIsNew(true);
    setEditing({
      id: generateId('ord'),
      customer_id: null,
      quote_id: null,
      order_date: new Date().toISOString().split('T')[0],
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
    <div className="card" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div>
          <h2>Orders</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Track and manage your customer orders.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Order</button>
      </div>

      <div className="form-row form-row-2" style={{ marginBottom: 20 }}>
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
          <div className="empty-state-icon">🛍️</div>
          <div className="empty-state-title">No orders found</div>
          <button className="btn btn-primary mt-12" onClick={openNew}>+ Create your first order</button>
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
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const customer = customers.find(c => c.id === o.customer_id);
                const quote = saved_quotes.find(q => q.id === o.quote_id);
                
                let badgeClass = 'badge-accent';
                if (o.status === 'Confirmed') badgeClass = 'badge-amber';
                if (o.status === 'Delivered') badgeClass = 'badge-success';
                if (o.status === 'Cancelled') badgeClass = 'badge-danger';

                return (
                  <tr key={o.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{customer ? customer.name : <span className="text-muted">No Customer</span>}</div>
                    </td>
                    <td>
                      {quote ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleOpenQuote(quote.id)} style={{ padding: '4px 8px' }}>
                          📄 {quote.name}
                        </button>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>No Quote</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>Ordered: {o.order_date || '—'}</div>
                      <div style={{ fontSize: 12 }}>Due: {o.due_date || '—'}</div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{o.status}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {o.notes || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setIsNew(false); setEditing({ ...o }); }}>✏️</button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteTarget(o)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor Modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{isNew ? 'New Order' : 'Edit Order'}</h3>
            <form onSubmit={handleSave}>
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
              <div className="form-group">
                <label>Notes</label>
                <textarea className="textarea" style={{ width: '100%', height: 60 }} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-danger)' }}>Delete Order</h3>
            <p>Are you sure you want to delete this order? This cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
