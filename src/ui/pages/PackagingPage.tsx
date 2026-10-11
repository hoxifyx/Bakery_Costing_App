import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { PackagingItem } from '../../engine/types';
import { NumberInput, SearchBar, ConfirmDialog, fmtMoney } from '../components/Shared';
import { exportPackagingCSV } from '../../io/io';
import { generateId } from '../../engine/utils';

function getUsedIn(id: string, data: ReturnType<typeof useStore>['state']['data']): string[] {
  const used: string[] = [];
  for (const bp of data.batch_products) if (bp.box_id === id) used.push(`Batch product: ${bp.name}`);
  for (const ap of data.assembled_products) if (ap.box_id === id) used.push(`Assembled product: ${ap.name}`);
  const s = data.settings;
  if (s.edible_print_item_id === id) used.push('Settings: Edible print role');
  if (s.cake_box_item_id === id) used.push('Settings: Cake box role');
  if (s.mdf_board_item_id === id) used.push('Settings: MDF board role');
  if (s.standard_board_item_id === id) used.push('Settings: Standard board role');
  if (s.wallpaper_item_id === id) used.push('Settings: Wallpaper role');
  return used;
}

export function PackagingPage() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const cur = data.settings.currency_code;

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PackagingItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackagingItem | null>(null);

  const filtered = useMemo(() =>
    data.packaging_items
      .filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    [data.packaging_items, search]);

  const openNew = () => {
    setIsNew(true);
    setEditing({ id: generateId('pkg'), name: '', price: 0 });
  };

  const openEdit = (p: PackagingItem) => { setIsNew(false); setEditing({ ...p }); };
  const duplicate = (p: PackagingItem) => {
    setIsNew(true);
    setEditing({ ...p, id: generateId('pkg'), name: p.name + ' (copy)' });
  };

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    if (isNew) dispatch({ type: 'ADD_PACKAGING', item: editing });
    else dispatch({ type: 'UPDATE_PACKAGING', item: editing });
    setEditing(null);
  };

  const confirmDelete = (p: PackagingItem) => {
    const used = getUsedIn(p.id, data);
    if (used.length > 0) { alert(`Cannot delete "${p.name}":\n${used.join('\n')}`); return; }
    setDeleteTarget(p);
  };

  const exportCSV = () => {
    const csv = exportPackagingCSV(data.packaging_items);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'packaging.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Catalog</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Packaging</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Packaging</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          <button className="quote-toolbar-btn" onClick={exportCSV}>
            <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
            <span>Export CSV</span>
          </button>
          <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
            <span>Add packaging</span>
          </button>
        </div>
      </div>

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>inventory_2</span>
              <h2 className="decorations-header-title">Packaging Catalog</h2>
            </div>
            <span className="decorations-header-right">
              {filtered.length} of {data.packaging_items.length} packaging items
            </span>
          </div>

          <SearchBar value={search} onChange={setSearch} placeholder="Search packaging…" maxWidth={420} />

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>inventory_2</span>
              </div>
              <div className="empty-state-title">{search ? 'No packaging found' : 'No packaging items yet'}</div>
              <div className="empty-state-text">{search ? 'Try a different search term' : 'Add boxes, boards, prints, or wraps to get started'}</div>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={openNew}>
                <span className="material-symbols-outlined ms-18" aria-hidden>add</span>
                <span>Add packaging</span>
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Used In</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                      </td>
                      <td className="td-mono text-green">{fmtMoney(p.price, cur)}</td>
                      <td className="text-secondary text-sm">{getUsedIn(p.id, data).length || '—'}</td>
                      <td className="text-muted text-sm truncate" style={{ maxWidth: 200 }}>{p.notes || '—'}</td>
                      <td>
                        <div className="td-actions">
                          <button className="quote-toolbar-btn" onClick={() => openEdit(p)} title="Edit" aria-label={`Edit ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                            <span className="material-symbols-outlined ms-16" aria-hidden>edit</span>
                          </button>
                          <button className="quote-toolbar-btn" onClick={() => duplicate(p)} title="Duplicate" aria-label={`Duplicate ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
                            <span className="material-symbols-outlined ms-16" aria-hidden>content_copy</span>
                          </button>
                          <button className="quote-toolbar-btn" onClick={() => confirmDelete(p)} title="Delete" aria-label={`Delete ${p.name}`} style={{ width: 32, height: 32, padding: 0 }}>
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
                {isNew ? 'Add packaging' : `Edit: ${editing.name}`}
              </h2>
              <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)} aria-label="Close">
                <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="input" value={editing.name} onChange={e => setEditing(v => v && ({ ...v, name: e.target.value }))} placeholder="e.g. 12-hole box" />
              </div>
              <div className="form-group">
                <label>Price ({cur})</label>
                <NumberInput value={editing.price} onChange={v => setEditing(p => p && ({ ...p, price: v }))} step={0.01} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input className="input" value={editing.notes ?? ''} onChange={e => setEditing(p => p && ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="quote-toolbar-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={save} disabled={!editing.name.trim()}>
                <span className="material-symbols-outlined ms-16" aria-hidden>save</span>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"?`}
          onConfirm={() => { dispatch({ type: 'DELETE_PACKAGING', id: deleteTarget!.id }); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
          danger
        />
      )}
    </div>
  );
}
