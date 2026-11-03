import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../../store/store';
import type { Settings, SizeGuideEntry } from '../../engine/types';
import { NumberInput } from '../components/Shared';

export function SettingsPage() {
  const { state, dispatch } = useStore();
  const { settings, ingredients, packaging_items, size_guide } = state.data;
  const sortedIngredients = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
  const gramIngredients = sortedIngredients.filter(ing => ing.unit_type === 'g');
  const sortedPackaging = [...packaging_items].sort((a, b) => a.name.localeCompare(b.name));
  const [localSettings, setLocalSettings] = useState<Settings>({ ...settings });
  const [localSizeGuide, setLocalSizeGuide] = useState<SizeGuideEntry[]>([...size_guide]);
  const [draggedSgIndex, setDraggedSgIndex] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setErrorMsg(null);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();

    // Validation: margin must be < 1 (100%)
    if (localSettings.target_margin >= 1) {
      setErrorMsg('Target margin must be less than 100% (less than 1.0). A margin of 100% or greater is mathematically impossible for gross margin pricing.');
      return;
    }
    if (localSettings.target_margin < 0) {
      setErrorMsg('Target margin cannot be negative.');
      return;
    }
    if (localSettings.overhead_pct < 0) {
      setErrorMsg('Overhead percentage cannot be negative.');
      return;
    }
    if (localSettings.labour_rate_per_hour < 0) {
      setErrorMsg('Labour rate cannot be negative.');
      return;
    }

    dispatch({ type: 'SET_SETTINGS', settings: localSettings });
    dispatch({ type: 'SET_SIZE_GUIDE', guide: localSizeGuide });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  return (
    <form onSubmit={handleSave}>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Tools</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Settings</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">System Settings</h1>
          </div>
        </div>
        <div className="quote-toolbar">
          {savedMsg && (
            <span className="badge badge-green" style={{ padding: '6px 12px' }}>
              <span className="material-symbols-outlined ms-14" aria-hidden>check_circle</span>
              Settings Saved
            </span>
          )}
          <button
            type="button"
            className="quote-toolbar-btn"
            onClick={() => {
              setLocalSettings({ ...settings });
              setLocalSizeGuide([...size_guide]);
            }}
          >
            <span className="material-symbols-outlined ms-16" aria-hidden>restart_alt</span>
            <span>Discard</span>
          </button>
          <button type="submit" className="quote-toolbar-btn quote-toolbar-btn-primary">
            <span className="material-symbols-outlined ms-18" aria-hidden>save</span>
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="error-banner" style={{ marginTop: 16 }}>
          <span className="material-symbols-outlined ms-16" aria-hidden>error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="quote-page-root">
        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>payments</span>
              <h2 className="decorations-header-title">Pricing &amp; Economics</h2>
            </div>
            <span className="decorations-header-right">SECTION 01</span>
          </div>

          <div className="form-group">
            <label>Currency Code</label>
            <input
              type="text"
              className="input"
              style={{ width: '100%' }}
              value={localSettings.currency_code}
              onChange={e => handleChange('currency_code', e.target.value)}
              placeholder="BDT, USD, EUR..."
              required
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Symbol or ISO code displayed next to all monetary amounts.</span>
          </div>

          <div className="form-row form-row-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Labour Rate per Hour</label>
              <NumberInput
                value={localSettings.labour_rate_per_hour}
                onChange={v => handleChange('labour_rate_per_hour', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Standard hourly rate for bakery decoration and prep labour.</span>
            </div>

            <div className="form-group">
              <label>Overhead Percentage (e.g. 0.25 for 25%)</label>
              <NumberInput
                value={localSettings.overhead_pct}
                onChange={v => handleChange('overhead_pct', v)}
                step={0.01}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Applied once per cost: raw recipe cost, decoration sum, and bought fillings.
                <br />
                <em>Note: Applied once per cost; see the Explain view.</em>
              </span>
            </div>

            <div className="form-group">
              <label>Target Gross Margin (e.g. 0.30 for 30%)</label>
              <NumberInput
                value={localSettings.target_margin}
                onChange={v => handleChange('target_margin', v)}
                step={0.01}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Target profit margin on non-delivery revenue: Profit = (Cost - Delivery) × Margin / (1 - Margin). Must be &lt; 1.0 (100%).
              </span>
            </div>

            <div className="form-group">
              <label>Packaging Allowance (e.g. 0.20 for 20%)</label>
              <NumberInput
                value={localSettings.packaging_allowance_pct}
                onChange={v => handleChange('packaging_allowance_pct', v)}
                step={0.01}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contingency buffer percentage applied to total packaging costs.</span>
            </div>

            <div className="form-group">
              <label>Standard Topper Price</label>
              <NumberInput
                value={localSettings.topper_price}
                onChange={v => handleChange('topper_price', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Default price charged per standard acrylic/paper cake topper.</span>
            </div>

            <div className="form-group">
              <label>Price Rounding Step (0 = Off)</label>
              <NumberInput
                value={localSettings.price_rounding_step ?? 0}
                onChange={v => handleChange('price_rounding_step', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                When &gt; 0 (e.g. 10 or 50), shows suggested rounded selling prices alongside exact prices.
                <br />
                <span style={{ color: 'var(--text-secondary)' }}>Note: Rounding is display-only and never used in calculations.</span>
              </span>
            </div>
          </div>
        </div>

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>architecture</span>
              <h2 className="decorations-header-title">Cake Engineering Factors</h2>
            </div>
            <span className="decorations-header-right">SECTION 02</span>
          </div>

          <div className="form-row form-row-3" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Cake Batches per kg of Cake</label>
              <NumberInput
                value={localSettings.cake_batches_per_kg}
                onChange={v => handleChange('cake_batches_per_kg', v)}
                step={0.05}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Number of sponge batches needed to yield 1 kg of finished cake (default: 1.0).
              </span>
            </div>

            <div className="form-group">
              <label>Frosting Batches per kg of Cake</label>
              <NumberInput
                value={localSettings.frosting_batches_per_kg}
                onChange={v => handleChange('frosting_batches_per_kg', v)}
                step={0.05}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Number of frosting batches needed to cover/crumb coat 1 kg of cake (default: 1.25).
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Filling Grams per kg of Cake</label>
              <NumberInput
                value={localSettings.filling_grams_per_kg}
                onChange={v => handleChange('filling_grams_per_kg', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Standard weight in grams of filling used per 1 kg of layered cake (default: 150g).
              </span>
            </div>
          </div>
        </div>

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>link</span>
              <h2 className="decorations-header-title">Role Mappings</h2>
            </div>
            <span className="decorations-header-right">SECTION 03</span>
          </div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            Map generic quote roles (fondant, edible print, boards, boxes) to specific items in your catalog.
          </div>

          <div className="form-row form-row-2" style={{ marginBottom: 0 }}>
            <div className="form-group">
              <label>Fondant Ingredient</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.fondant_ingredient_id ?? ''}
                onChange={e => handleChange('fondant_ingredient_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {gramIngredients.length === 0
                  ? <option value="__no-gram-ingredients__" disabled>Add a gram-type ingredient first</option>
                  : gramIngredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit_type})</option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label>Edible Print Item</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.edible_print_item_id ?? ''}
                onChange={e => handleChange('edible_print_item_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedPackaging.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Standard Cake Box</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.cake_box_item_id ?? ''}
                onChange={e => handleChange('cake_box_item_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedPackaging.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>MDF Drum Board</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.mdf_board_item_id ?? ''}
                onChange={e => handleChange('mdf_board_item_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedPackaging.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Standard Cake Board (per extra tier)</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.standard_board_item_id ?? ''}
                onChange={e => handleChange('standard_board_item_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedPackaging.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Wallpaper / Cake Wrap</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.wallpaper_item_id ?? ''}
                onChange={e => handleChange('wallpaper_item_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedPackaging.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>straighten</span>
              <h2 className="decorations-header-title">Size Guide</h2>
            </div>
            <span className="decorations-header-right">SECTION 04</span>
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Define the pan sizes available when building a quote tier. Drag the handle to reorder.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localSizeGuide.map((sg, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={e => { setDraggedSgIndex(idx); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (draggedSgIndex === null || draggedSgIndex === idx) return;
                  const newG = [...localSizeGuide];
                  const [m] = newG.splice(draggedSgIndex, 1);
                  newG.splice(idx, 0, m);
                  setLocalSizeGuide(newG);
                  setDraggedSgIndex(null);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px minmax(0, 1fr) 32px',
                  gap: 8,
                  alignItems: 'center',
                  minWidth: 0,
                  background: 'var(--bg-surface-container)',
                  padding: 12,
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ cursor: 'grab', opacity: 0.5, display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined ms-20" aria-hidden>drag_indicator</span>
                </div>
                <div className="form-row form-row-3" style={{ minWidth: 0, gap: 12, marginBottom: 0 }}>
                  <div className="form-group" style={{ minWidth: 0, marginBottom: 0 }}>
                    <label>Label</label>
                    <input type="text" className="input" style={{ width: '100%' }} value={sg.label} onChange={e => {
                      const newG = [...localSizeGuide];
                      newG[idx].label = e.target.value;
                      setLocalSizeGuide(newG);
                    }} placeholder='e.g. 5"' required />
                  </div>
                  <div className="form-group" style={{ minWidth: 0, marginBottom: 0 }}>
                    <label>Weight (kg)</label>
                    <NumberInput value={sg.kg} onChange={v => {
                      const newG = [...localSizeGuide];
                      newG[idx].kg = v;
                      setLocalSizeGuide(newG);
                    }} step={0.1} min={0} />
                  </div>
                  <div className="form-group" style={{ minWidth: 0, marginBottom: 0 }}>
                    <label>Servings</label>
                    <NumberInput value={sg.servings} onChange={v => {
                      const newG = [...localSizeGuide];
                      newG[idx].servings = v;
                      setLocalSizeGuide(newG);
                    }} step={1} min={0} />
                  </div>
                </div>
                <button type="button" className="quote-toolbar-btn" aria-label={`Remove ${sg.label || 'size'} row`} title="Remove size" style={{ width: 32, height: 32, padding: 0 }} onClick={() => {
                  setLocalSizeGuide(g => g.filter((_, i) => i !== idx));
                }}>
                  <span className="material-symbols-outlined ms-16" aria-hidden>close</span>
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="quote-toolbar-btn" onClick={() => {
            setLocalSizeGuide(g => [...g, { label: '', kg: 0, servings: 0 }]);
          }}>
            <span className="material-symbols-outlined ms-16" aria-hidden>add</span>
            <span>Add Size</span>
          </button>
        </div>
      </div>
    </form>
  );
}
