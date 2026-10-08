import { useState, useMemo } from 'react';
import { useStore } from '../../store/store';
import type { PackagingItem } from '../../engine/types';
import { NumberInput, SearchBar, ConfirmDialog } from '../components/Shared';
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
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">📦 Packaging</h1>
            <p className="page-subtitle">{data.packaging_items.length} items · Boxes, boards, prints</p>
          </div>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={exportCSV}>CSV ⬇</button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Add packaging</button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="flex justify-between items-center mb-12">
          <SearchBar value={search} onChange={setSearch} placeholder="Search packaging…" />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No packaging items yet</div>
            <button className="btn btn-primary mt-12" onClick={openNew}>+ Add packaging</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Used in</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{p.id}</div>
                    </td>
                    <td className="td-mono text-green">{cur} {p.price.toFixed(2)}</td>
                    <td className="text-secondary text-sm">{getUsedIn(p.id, data).length || '—'}</td>
                    <td className="text-muted text-sm truncate" style={{ maxWidth: 200 }}>{p.notes || '—'}</td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)}>✏️</button>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => duplicate(p)}>📋</button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => confirmDelete(p)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isNew ? 'Add packaging' : `Edit: ${editing.name}`}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>✕</button>
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
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={!editing.name.trim()}>Save</button>
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
