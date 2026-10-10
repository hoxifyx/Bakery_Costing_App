import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { Customer } from '../../engine/types';
import { generateId } from '../../engine/utils';
import { SearchBar } from '../components/Shared';

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
    <>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Records</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Customers</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Customers</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined ms-18" aria-hidden>person_add</span>
            <span>New Customer</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>person_search</span>
              <h2 className="decorations-header-title">Find Customers</h2>
            </div>
            <span className="decorations-header-right">{filtered.length} of {customers.length} customers</span>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or phone…" />
        </div>

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>group</span>
              <h2 className="decorations-header-title">Customer Directory</h2>
            </div>
            <span className="decorations-header-right">{filtered.length} of {customers.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>group</span>
              </div>
              <div className="empty-state-title">No customers found</div>
              <div className="empty-state-text">
                {search ? 'Try a different search term' : 'Add your first customer to get started'}
              </div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
                <span className="material-symbols-outlined ms-18" aria-hidden>person_add</span>
                <span>Add customer</span>
              </button>
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
                        {c.phone && (
                          <div style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined ms-14" aria-hidden>call</span>
                            {c.phone}
                          </div>
                        )}
                        {c.email && (
                          <div style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined ms-14" aria-hidden>mail</span>
                            {c.email}
                          </div>
                        )}
                        {!c.phone && !c.email && <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                          {c.address || '—'}
                        </div>
                      </td>
                      <td>
                        <div className="text-muted" style={{ fontSize: 12, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.notes || '—'}
                        </div>
                      </td>
                      <td>
                        <div className="td-actions">
                          <button className="quote-toolbar-btn" onClick={() => { setIsNew(false); setEditing({ ...c }); }} title="Edit customer" aria-label="Edit customer" style={{ width: 32, height: 32, padding: 0 }}>
                            <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                          </button>
                          <button className="quote-toolbar-btn" onClick={() => setDeleteTarget(c)} title="Delete customer" aria-label="Delete customer" style={{ width: 32, height: 32, padding: 0 }}>
                            <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                {isNew ? 'New Customer' : 'Edit Customer'}
              </h2>
              <button type="button" className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
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
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Notes</label>
                  <textarea className="textarea" style={{ width: '100%', height: 60 }} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="quote-toolbar-btn" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="quote-toolbar-btn quote-toolbar-btn-primary">
                  <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                  <span>Save Customer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined ms-18" aria-hidden>
                  {customerOrders.length > 0 ? 'block' : 'delete'}
                </span>
                {customerOrders.length > 0 ? 'Cannot Delete' : 'Delete Customer'}
              </h2>
              <button type="button" className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setDeleteTarget(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              {customerOrders.length > 0 ? (
                <>
                  <p>Cannot delete <strong>{deleteTarget.name}</strong> because they have {customerOrders.length} associated order(s):</p>
                  <div className="warning-banner" style={{ display: 'block', marginTop: 12 }}>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                      {customerOrders.map(o => (
                        <li key={o.id} style={{ marginBottom: 4 }}>
                          Order on {o.order_date || 'Unknown'} — Status: <span className="badge badge-amber">{o.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 0 }}>You must delete or reassign these orders first.</p>
                </>
              ) : (
                <p>Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
              )}
            </div>
            <div className="modal-footer">
              {customerOrders.length > 0 ? (
                <button type="button" className="quote-toolbar-btn" onClick={() => setDeleteTarget(null)}>Close</button>
              ) : (
                <>
                  <button type="button" className="quote-toolbar-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
                  <button type="button" className="btn btn-danger" onClick={handleDelete}>
                    <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
