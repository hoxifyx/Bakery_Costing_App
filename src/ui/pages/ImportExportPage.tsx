import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/store';
import {
  exportAllData,
  downloadJSON,
  downloadBlankTemplate,
  getExportFilename,
  parseImportFile,
  exportIngredientsCSV,
  exportPackagingCSV,
  importIngredientsCSV,
  MAX_IMPORT_SIZE,
  CURRENT_APP_VERSION,
  CURRENT_SCHEMA_VERSION
} from '../../io/io';
import { createBackup, restoreBackup, getBackupHistory, deleteBackup, signIn, signOut } from '../../cloud/backupManager';
import type { ImportPreview } from '../../io/io';
import type { AppData } from '../../engine/types';

type PartialKey = keyof AppData;

export function ImportExportPage() {
  const { state, dispatch } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Partial Export selection
  const [selectedExportGroups, setSelectedExportGroups] = useState<Record<string, boolean>>({
    settings: true,
    ingredients: true,
    packaging_items: true,
    recipes: true,
    flavours: true,
    fillings: true,
    batch_products: true,
    assembled_products: true,
    size_guide: true,
    saved_quotes: true,
    customers: true,
    orders: true,
  });

  // Import State
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge' | 'replace_selected'>('replace');
  const [selectedImportGroups, setSelectedImportGroups] = useState<PartialKey[]>([
    'ingredients', 'packaging_items', 'recipes', 'flavours', 'fillings', 'batch_products', 'assembled_products', 'saved_quotes', 'customers', 'orders'
  ]);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // CSV State
  const [csvPricesOnly, setCsvPricesOnly] = useState(false);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Handlers for Export
  const handleFullExport = () => {
    const jsonStr = exportAllData(state.data);
    const filename = getExportFilename();
    downloadJSON(jsonStr, filename);
  };

  const handlePartialExport = () => {
    const partial: Partial<AppData> = {};
    for (const [key, enabled] of Object.entries(selectedExportGroups)) {
      if (enabled) {
        (partial as any)[key] = (state.data as any)[key];
      }
    }
    const envelope = {
      format: 'bakery-costing-data',
      schema_version: CURRENT_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      app_version: CURRENT_APP_VERSION,
      ...partial,
    };
    const jsonStr = JSON.stringify(envelope, null, 2);
    downloadJSON(jsonStr, `bakery-costing-partial-${new Date().toISOString().slice(0, 10)}.json`);
  };

  // Handler for File Selection
  const handleFile = (file: File) => {
    setImportStatus(null);
    if (!file.name.endsWith('.json')) {
      setImportStatus({ type: 'error', message: 'Only JSON files (.json) are supported.' });
      return;
    }
    if (file.size > MAX_IMPORT_SIZE) {
      setImportStatus({ type: 'error', message: 'File exceeds maximum allowed size of 20 MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const res = parseImportFile(text, state.data);
        setPreview(res);
      } catch (err: any) {
        setImportStatus({ type: 'error', message: `Failed to read file: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Apply Import
  const handleApplyImport = () => {
    if (!preview || !preview.valid) return;
    try {
      let dataToImport = preview.parsed;
      if (importMode === 'replace_selected') {
        const filtered: Partial<AppData> = {};
        for (const grp of selectedImportGroups) {
          if ((preview.parsed as any)[grp] !== undefined) {
            (filtered as any)[grp] = (preview.parsed as any)[grp];
          }
        }
        dataToImport = filtered;
      }
      dispatch({
        type: 'IMPORT_DATA',
        data: dataToImport,
        mode: importMode,
      });
      setImportStatus({
        type: 'success',
        message: `Successfully imported dataset using mode "${importMode}".`,
      });
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setImportStatus({ type: 'error', message: `Import error: ${err.message}` });
    }
  };

  // Undo Import
  const handleUndo = () => {
    if (!state.undoSnapshot) return;
    dispatch({ type: 'UNDO_IMPORT' });
    setImportStatus({ type: 'success', message: 'Undid last import and restored prior snapshot.' });
  };

  // CSV Import
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const content = ev.target?.result as string;
        const { items, errors } = importIngredientsCSV(content, state.data.ingredients, csvPricesOnly);
        if (errors.length > 0) {
          setCsvStatus(`Imported with warnings: ${errors.join(', ')}`);
        } else {
          setCsvStatus(`Successfully updated ingredients from CSV (${items.length} records total).`);
        }
        dispatch({
          type: 'IMPORT_DATA',
          data: { ingredients: items },
          mode: 'replace_selected',
        });
      } catch (err: any) {
        setCsvStatus(`CSV Import Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Tools</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Import / Export</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Import / Export</h1>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Full system backups, selective data transfers, spreadsheet CSV sync, and template downloads.
          </div>
        </div>
        <div className="quote-toolbar">
          {state.undoSnapshot && (
            <button className="quote-toolbar-btn" onClick={handleUndo}>
              <span className="material-symbols-outlined ms-16" aria-hidden>undo</span>
              <span>Undo Last Import</span>
            </button>
          )}
        </div>
      </div>

      <div className="quote-page-root">
        {importStatus && (
          <div className={importStatus.type === 'success' ? 'success-banner' : 'error-banner'}>
            <span className="material-symbols-outlined ms-18" aria-hidden>
              {importStatus.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{importStatus.message}</span>
          </div>
        )}

        <CloudBackupCard />

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>upload_file</span>
              <h2 className="decorations-header-title">Import JSON Dataset</h2>
            </div>
            <span className="decorations-header-right">Schema {CURRENT_SCHEMA_VERSION}</span>
          </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Select or drop a standard bakery costing JSON export. Data will be inspected and validated before any changes are applied.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '36px 20px',
            textAlign: 'center',
            background: isDragging ? 'rgba(167, 139, 250, 0.08)' : 'var(--bg-surface)',
            cursor: 'pointer',
            transition: 'border-color 150ms, background-color 150ms',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ marginBottom: 10 }}>
            <span className="material-symbols-outlined ms-32" aria-hidden>cloud_upload</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Click or drag & drop a .json file here
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Strict validation against schema {CURRENT_SCHEMA_VERSION} (max 20 MB)
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".json"
            style={{ display: 'none' }}
          />
        </div>

        {/* Import Preview Modal / Card */}
        {preview && (
          <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ fontSize: 15 }}>Import Preview</h4>
              <span className={`badge ${preview.valid ? 'badge-green' : 'badge-red'}`}>
                <span className="material-symbols-outlined ms-14" aria-hidden>{preview.valid ? 'check_circle' : 'error'}</span>
                {preview.valid ? 'Valid Dataset' : 'Has Validation Errors'}
              </span>
            </div>

            {/* Validation Errors */}
            {preview.errors.length > 0 && (
              <div className="error-banner" style={{ marginBottom: 12 }}>
                <strong>Blocking Validation Errors:</strong>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                  {preview.errors.map((e, idx) => (
                    <li key={idx}><strong>{e.path}:</strong> {e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="warning-banner" style={{ marginBottom: 12 }}>
                <strong>Warnings:</strong>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                  {preview.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Counts Table */}
            <div className="table-wrapper" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Entity Group</th>
                    <th>To Add</th>
                    <th>To Update</th>
                    <th>Unchanged</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview.counts).map(([group, val]) => {
                    if (typeof val === 'boolean') {
                      return (
                        <tr key={group}>
                          <td style={{ textTransform: 'capitalize' }}>{group.replace('_', ' ')}</td>
                          <td colSpan={3} style={{ color: val ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {val ? 'New settings present in file' : 'No settings in file'}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={group}>
                        <td style={{ textTransform: 'capitalize' }}>{group.replace('_', ' ')}</td>
                        <td style={{ color: val.add > 0 ? 'var(--accent-green)' : 'inherit' }}>{val.add}</td>
                        <td style={{ color: val.update > 0 ? 'var(--accent-amber)' : 'inherit' }}>{val.update}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{val.unchanged}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mode selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Select Import Application Mode:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span><strong>Replace Everything:</strong> Groups present in file replace current data completely; groups absent in file are retained.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span><strong>Merge:</strong> Upsert records by ID; existing records not mentioned in the file are never deleted.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="replace_selected"
                    checked={importMode === 'replace_selected'}
                    onChange={() => setImportMode('replace_selected')}
                  />
                  <span><strong>Replace Selected Groups Only:</strong> Choose specific catalogs below to replace.</span>
                </label>
              </div>

              {importMode === 'replace_selected' && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-base)', borderRadius: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {[
                    'settings', 'ingredients', 'packaging_items', 'recipes', 'flavours', 'fillings',
                    'batch_products', 'assembled_products', 'size_guide', 'saved_quotes', 'customers', 'orders',
                  ].map(grp => (
                    <label key={grp} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedImportGroups.includes(grp as PartialKey)}
                        onChange={e => {
                          if (e.target.checked) setSelectedImportGroups(prev => [...prev, grp as PartialKey]);
                          else setSelectedImportGroups(prev => prev.filter(g => g !== grp));
                        }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{grp.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <button className="quote-toolbar-btn" onClick={() => setPreview(null)}>Cancel</button>
              <button
                className="quote-toolbar-btn quote-toolbar-btn-primary"
                onClick={handleApplyImport}
                disabled={!preview.valid}
              >
                <span className="material-symbols-outlined ms-16" aria-hidden>check_circle</span>
                <span>Apply Import (Atomic)</span>
              </button>
            </div>
          </div>
        )}
        </div>

      {/* Export Section */}
      <div className="quote-section-card">
        <div className="decorations-section-header">
          <div className="decorations-header-left">
            <span className="material-symbols-outlined ms-20" aria-hidden>download</span>
            <h2 className="decorations-header-title">Export Data</h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20 }}>
          {/* Full Export */}
          <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Complete Database Backup</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Exports settings, catalogs, products, size guide, saved quotes, customers, and orders into one standard JSON file.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="quote-toolbar-btn quote-toolbar-btn-primary" style={{ flex: 1 }} onClick={handleFullExport}>
                <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
                Download Full Export (.json)
              </button>
              {state.cloud.signedIn && (
                <button 
                  className="quote-toolbar-btn"
                  onClick={async () => {
                    dispatch({ type: 'CLOUD_BUSY' });
                    try {
                      const res = await createBackup(state.data);
                      dispatch({ type: 'CLOUD_BACKUP_DONE', lastBackupAt: new Date().toISOString(), lastBackupFileId: res.fileId });
                      setImportStatus({ type: 'success', message: `Backed up to Drive: ${res.filename}` });
                    } catch (err: any) {
                      dispatch({ type: 'CLOUD_ERROR', error: err.message });
                      setImportStatus({ type: 'error', message: `Backup failed: ${err.message}` });
                    }
                  }}
                  disabled={state.cloud.busy}
                  aria-label="Backup to Drive"
                  title="Backup to Google Drive"
                >
                  <span className="material-symbols-outlined ms-18" aria-hidden>
                    {state.cloud.busy ? 'sync' : 'cloud_upload'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Partial Export */}
          <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Partial / Selective Export</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Tick the entity categories you want to include in the exported file:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8, marginBottom: 16 }}>
              {Object.keys(selectedExportGroups).map(k => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedExportGroups[k]}
                    onChange={e => setSelectedExportGroups(prev => ({ ...prev, [k]: e.target.checked }))}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{k.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
            <button className="quote-toolbar-btn quote-toolbar-btn-primary" style={{ width: '100%' }} onClick={handlePartialExport}>
              <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
              Export Selected Categories
            </button>
          </div>
        </div>
      </div>

      {/* CSV Spreadsheet Sync & Blank Template */}
      <div className="quote-section-card">
        <div className="decorations-section-header">
          <div className="decorations-header-left">
            <span className="material-symbols-outlined ms-20" aria-hidden>table_chart</span>
            <h2 className="decorations-header-title">Spreadsheet Sync &amp; Blank Templates</h2>
          </div>
        </div>

        {csvStatus && (
          <div className={csvStatus.startsWith('CSV Import Error:') ? 'error-banner' : csvStatus.startsWith('Imported with warnings:') ? 'warning-banner' : 'success-banner'}>
            <span className="material-symbols-outlined ms-18" aria-hidden>
              {csvStatus.startsWith('CSV Import Error:') ? 'error' : csvStatus.startsWith('Imported with warnings:') ? 'warning' : 'check_circle'}
            </span>
            <span>{csvStatus}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20 }}>
          {/* CSV Export */}
          <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 8 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Export Spreadsheets (CSV)</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Open directly in Microsoft Excel, Google Sheets, or Apple Numbers.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="quote-toolbar-btn"
                onClick={() => {
                  const csv = exportIngredientsCSV(state.data.ingredients);
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ingredients-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
                Export Ingredients (CSV)
              </button>
              <button
                className="quote-toolbar-btn"
                onClick={() => {
                  const csv = exportPackagingCSV(state.data.packaging_items);
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `packaging-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <span className="material-symbols-outlined ms-16" aria-hidden>download</span>
                Export Packaging (CSV)
              </button>
            </div>
          </div>

          {/* CSV Import */}
          <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 8 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Import Ingredients from CSV</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={csvPricesOnly}
                onChange={e => setCsvPricesOnly(e.target.checked)}
              />
              <span>Update prices only (leaves names &amp; units untouched)</span>
            </label>
            <input
              type="file"
              ref={csvInputRef}
              accept=".csv"
              onChange={handleCsvFile}
              style={{ display: 'none' }}
            />
            <button
              className="quote-toolbar-btn"
              style={{ width: '100%' }}
              onClick={() => csvInputRef.current?.click()}
            >
              <span className="material-symbols-outlined ms-16" aria-hidden>upload</span>
              Upload Ingredients CSV
            </button>
          </div>

          {/* Blank Template */}
          <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 8 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Blank Import Template</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Download the official schema-valid empty template (Appendix B) to start populating your catalog from scratch.
            </p>
            <button className="quote-toolbar-btn" style={{ width: '100%' }} onClick={downloadBlankTemplate}>
              <span className="material-symbols-outlined ms-16" aria-hidden>description</span>
              Download Blank Template (.json)
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Backup Card
// ─────────────────────────────────────────────────────────────────────────────

function CloudBackupCard() {
  const { state, dispatch } = useStore();
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  return (
    <div className="quote-section-card">
      <div className="decorations-section-header">
        <div className="decorations-header-left">
          <span className="material-symbols-outlined ms-20" aria-hidden>cloud_sync</span>
          <h2 className="decorations-header-title">Google Drive Cloud Backup</h2>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Back up your entire bakery database to a hidden, app-only folder in your Google Drive — invisible to other apps and to you in regular Drive UI.
      </p>

      {state.cloud.error && (
        <div className="error-banner" role="alert">
          <span className="material-symbols-outlined ms-18" aria-hidden>error</span>
          <span>{state.cloud.error}</span>
          <button
            className="quote-toolbar-btn"
            style={{ marginLeft: 'auto', width: 32, height: 32, padding: 0 }}
            onClick={() => dispatch({ type: 'CLOUD_IDLE' })}
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
          </button>
        </div>
      )}

      {backupMsg && (
        <div className="success-banner">
          <span className="material-symbols-outlined ms-18" aria-hidden>check_circle</span>
          <span>{backupMsg}</span>
        </div>
      )}

      {!state.cloud.configured ? (
        <div style={{ padding: 16, background: 'var(--bg-surface-container)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
          <strong>Not configured.</strong> Add <code>VITE_GOOGLE_CLIENT_ID</code> to your <code>.env</code> file to enable cloud backup. See <em>README.md → Cloud Backup (Google Drive)</em> for setup instructions.
        </div>
      ) : !state.cloud.signedIn ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined ms-32" aria-hidden>lock</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Not connected to Google Drive</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              OvenCost Pro will request permission to access a hidden, app-specific folder only. It cannot read or modify any other file in your Drive.
            </div>
            <button
              id="cloud-connect-btn"
              className="quote-toolbar-btn quote-toolbar-btn-primary"
              disabled={state.cloud.busy}
              onClick={async () => {
                dispatch({ type: 'CLOUD_BUSY' });
                try {
                  const user = await signIn();
                  dispatch({ type: 'CLOUD_SIGNED_IN', user });
                } catch (err: any) {
                  dispatch({ type: 'CLOUD_ERROR', error: err.message });
                }
              }}
            >
              <span className="material-symbols-outlined ms-16" aria-hidden>{state.cloud.busy ? 'sync' : 'link'}</span>
              <span>{state.cloud.busy ? 'Connecting...' : 'Connect Google Drive'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
            <div aria-live="polite" style={{ fontSize: 13 }}>
              <span className="material-symbols-outlined ms-16" aria-hidden style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--accent-green)' }}>check_circle</span>
              <strong>{state.cloud.user?.email}</strong>
              {state.cloud.user?.name ? <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({state.cloud.user.name})</span> : null}
            </div>
            <button
              className="quote-toolbar-btn"
              onClick={() => { signOut(); dispatch({ type: 'CLOUD_SIGNED_OUT' }); }}
            >
              Disconnect
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              id="cloud-backup-now-btn"
              className="quote-toolbar-btn quote-toolbar-btn-primary"
              disabled={state.cloud.busy}
              onClick={async () => {
                dispatch({ type: 'CLOUD_BUSY' });
                setBackupMsg(null);
                try {
                  const res = await createBackup(state.data);
                  dispatch({ type: 'CLOUD_BACKUP_DONE', lastBackupAt: new Date().toISOString(), lastBackupFileId: res.fileId });
                  setBackupMsg(`Backup saved: ${res.filename}`);
                } catch (err: any) {
                  dispatch({ type: 'CLOUD_ERROR', error: err.message });
                }
              }}
            >
              <span className="material-symbols-outlined ms-16" aria-hidden>{state.cloud.busy ? 'sync' : 'backup'}</span>
              <span>{state.cloud.busy ? 'Backing up...' : 'Back up now'}</span>
            </button>
            <button
              id="cloud-restore-btn"
              className="quote-toolbar-btn"
              disabled={state.cloud.busy}
              onClick={() => setRestoreModalOpen(true)}
            >
              <span className="material-symbols-outlined ms-16" aria-hidden>settings_backup_restore</span>
              <span>Restore from backup</span>
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Last backed up:{' '}
            {state.cloud.lastBackupAt
              ? new Date(state.cloud.lastBackupAt).toLocaleString()
              : 'Never backed up from this device.'}
            &ensp;·&ensp;Up to 10 most recent backups are kept; older ones are pruned automatically.
          </div>
        </div>
      )}

      {restoreModalOpen && <RestoreModal onClose={() => setRestoreModalOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore Modal
// ─────────────────────────────────────────────────────────────────────────────

function RestoreModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [backups, setBackups] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Load backup list on mount
  useEffect(() => {
    getBackupHistory().then(res => {
      setBackups(res);
      setLoading(false);
    }).catch(err => {
      dispatch({ type: 'CLOUD_ERROR', error: err.message });
      onClose();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (mode: 'replace' | 'merge') => {
    if (!preview || !preview.valid) return;
    dispatch({ type: 'IMPORT_DATA', data: preview.parsed, mode });
    dispatch({ type: 'CLOUD_RESTORE_APPLIED' });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Restore from Google Drive">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined ms-18" aria-hidden>settings_backup_restore</span>
            Restore from Google Drive
          </h2>
          <button className="quote-toolbar-btn" style={{ width: 32, height: 32, padding: 0 }} onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined ms-24" aria-hidden>sync</span>
              <div>Loading backups…</div>
            </div>
          ) : preview ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: 15 }}>Import Preview</h4>
                <span className={`badge ${preview.valid ? 'badge-green' : 'badge-red'}`}>
                  <span className="material-symbols-outlined ms-14" aria-hidden>{preview.valid ? 'check_circle' : 'error'}</span>
                  {preview.valid ? 'Valid' : 'Errors'}
                </span>
              </div>

              {preview.errors.length > 0 && (
                <div className="error-banner" style={{ marginBottom: 12 }}>
                  <strong>Blocking errors:</strong>
                  <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                    {preview.errors.map((e, i) => <li key={i}><strong>{e.path}:</strong> {e.message}</li>)}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="warning-banner" style={{ marginBottom: 12 }}>
                  <strong>Warnings:</strong>
                  <ul style={{ margin: '6px 0 0 16px', fontSize: 12 }}>
                    {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="table-wrapper" style={{ marginBottom: 16 }}>
                <table className="table">
                  <thead><tr><th>Group</th><th>Add</th><th>Update</th><th>Unchanged</th></tr></thead>
                  <tbody>
                    {Object.entries(preview.counts).map(([group, val]) =>
                      typeof val === 'boolean' ? null : (
                        <tr key={group}>
                          <td style={{ textTransform: 'capitalize' }}>{group.replace('_', ' ')}</td>
                          <td style={{ color: val.add > 0 ? 'var(--accent-green)' : 'inherit' }}>{val.add}</td>
                          <td style={{ color: val.update > 0 ? 'var(--accent-amber)' : 'inherit' }}>{val.update}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{val.unchanged}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="quote-toolbar-btn" onClick={() => setPreview(null)}>
                  <span className="material-symbols-outlined ms-16" aria-hidden>arrow_back</span>
                  Back to list
                </button>
                <button className="quote-toolbar-btn" disabled={!preview.valid} onClick={() => handleApply('merge')}>Merge into current data</button>
                <button className="quote-toolbar-btn quote-toolbar-btn-primary" disabled={!preview.valid} onClick={() => handleApply('replace')}>Replace all with this backup</button>
              </div>
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>inbox</span>
              </div>
              <div className="empty-state-title">No backups found</div>
              <div className="empty-state-text">No backups found for this Google account.</div>
              <button className="quote-toolbar-btn" onClick={onClose}>Close</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {backups.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 12, background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(b.modifiedTime).toLocaleString()} &bull; {Math.round(b.size / 1024)} KB
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="quote-toolbar-btn"
                      onClick={() => {
                        setLoading(true);
                        restoreBackup(b.id, state.data)
                          .then(p => { setPreview(p); setLoading(false); })
                          .catch(err => { dispatch({ type: 'CLOUD_ERROR', error: err.message }); onClose(); });
                      }}
                    >
                      <span className="material-symbols-outlined ms-16" aria-hidden>visibility</span>
                      Preview &amp; Restore
                    </button>
                    <button
                      className="quote-toolbar-btn"
                      style={{ color: 'var(--accent-red)' }}
                      aria-label={`Delete backup ${b.name}`}
                      onClick={async () => {
                        if (confirm('Delete this backup permanently?')) {
                          setLoading(true);
                          await deleteBackup(b.id);
                          const fresh = await getBackupHistory();
                          setBackups(fresh);
                          setLoading(false);
                        }
                      }}
                    >
                      <span className="material-symbols-outlined ms-16" aria-hidden>delete</span>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
