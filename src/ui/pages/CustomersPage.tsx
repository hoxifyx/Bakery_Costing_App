import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Customer } from '../../engine/types';
import { generateId } from '../../engine/utils';

export function CustomersPage() {
  const { state, dispatch } = useStore();
  const { customers, orders } = state.data;
  const [search, setSearch] = useState('');
  
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const openNew = () => {
    setIsNew(true);
    setEditing({
      id: generateId('cust'),
      name: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    dispatch({ type: isNew ? 'ADD_CUSTOMER' : 'UPDATE_CUSTOMER', item: editing });
    setEditing(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_CUSTOMER', id: deleteTarget.id });
    setDeleteTarget(null);
  };

  const customerOrders = deleteTarget 
    ? orders.filter(o => o.customer_id === deleteTarget.id) 
    : [];

  return (
    <div className="card" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <div>
          <h2>Customers</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Manage client details and contact information.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Customer</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input 
          type="text" 
          className="input" 
          placeholder="Search by name, email, or phone..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          style={{ width: '100%', maxWidth: 400 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No customers found</div>
          <button className="btn btn-primary mt-12" onClick={openNew}>+ Add your first customer</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Notes</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                  </td>
                  <td>
                    {c.phone && <div style={{ fontSize: 12 }}>📞 {c.phone}</div>}
                    {c.email && <div style={{ fontSize: 12 }}>✉️ {c.email}</div>}
                    {!c.phone && !c.email && <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                      {c.address || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.notes || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="td-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setIsNew(false); setEditing({ ...c }); }}>✏️</button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteTarget(c)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor Modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{isNew ? 'New Customer' : 'Edit Customer'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Name</label>
                <input required autoFocus className="input" style={{ width: '100%' }} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Phone</label>
                  <input className="input" style={{ width: '100%' }} value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" className="input" style={{ width: '100%' }} value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea className="textarea" style={{ width: '100%', height: 60 }} value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="textarea" style={{ width: '100%', height: 60 }} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-danger)' }}>Delete Customer</h3>
            
            {customerOrders.length > 0 ? (
              <>
                <p>Cannot delete <strong>{deleteTarget.name}</strong> because they have {customerOrders.length} associated order(s):</p>
                <ul style={{ margin: '12px 0', paddingLeft: 20, fontSize: 14 }}>
                  {customerOrders.slice(0, 5).map(o => (
                    <li key={o.id}>Order on {o.order_date || 'Unknown'} - Status: {o.status}</li>
                  ))}
                  {customerOrders.length > 5 && <li>...and {customerOrders.length - 5} more</li>}
                </ul>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>You must delete or reassign these orders first.</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Close</button>
                </div>
              </>
            ) : (
              <>
                <p>Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                  <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
