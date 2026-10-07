import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../../store/store';
import type { Settings, SizeGuideEntry } from '../../engine/types';
import { NumberInput } from '../components/Shared';

export function SettingsPage() {
  const { state, dispatch } = useStore();
  const { settings, ingredients, packaging_items, size_guide } = state.data;
  const sortedIngredients = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
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
    <div className="card" style={{ maxWidth: 840, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2>System Settings</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Configure global labor rates, overhead multipliers, target margins, batch factors, and role mappings.
          </div>
        </div>
        {savedMsg && <span className="badge badge-success" style={{ padding: '6px 12px' }}>✓ Settings Saved</span>}
      </div>

      {errorMsg && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* Financial & Rates Block */}
          <div className="card" style={{ background: 'var(--bg-surface)' }}>
            <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--accent)' }}>Pricing & Economics</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Currency Code</label>
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Labour Rate per Hour</label>
              <NumberInput
                value={localSettings.labour_rate_per_hour}
                onChange={v => handleChange('labour_rate_per_hour', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Standard hourly rate for bakery decoration and prep labour.</span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Overhead Percentage (e.g. 0.25 for 25%)
              </label>
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Target Gross Margin (e.g. 0.30 for 30%)
              </label>
              <NumberInput
                value={localSettings.target_margin}
                onChange={v => handleChange('target_margin', v)}
                step={0.01}
                min={0}
                max={0.999}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Target profit margin on non-delivery revenue: Profit = (Cost - Delivery) × Margin / (1 - Margin). Must be &lt; 1.0 (100%).
              </span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Packaging Allowance (e.g. 0.20 for 20%)
              </label>
              <NumberInput
                value={localSettings.packaging_allowance_pct}
                onChange={v => handleChange('packaging_allowance_pct', v)}
                step={0.01}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Contingency buffer percentage applied to total packaging costs.</span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Standard Topper Price</label>
              <NumberInput
                value={localSettings.topper_price}
                onChange={v => handleChange('topper_price', v)}
                step={1}
                min={0}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Default price charged per standard acrylic/paper cake topper.</span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Price Rounding Step (0 = Off)</label>
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

          {/* Cake Engineering & Ratios */}
          <div className="card" style={{ background: 'var(--bg-surface)' }}>
            <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--accent)' }}>Cake Engineering Factors</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Cake Batches per kg of Cake</label>
              <NumberInput
                value={localSettings.cake_batches_per_kg}
                onChange={v => handleChange('cake_batches_per_kg', v)}
                step={0.05}
                min={0.01}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Number of sponge batches needed to yield 1 kg of finished cake (default: 1.0).
              </span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Frosting Batches per kg of Cake</label>
              <NumberInput
                value={localSettings.frosting_batches_per_kg}
                onChange={v => handleChange('frosting_batches_per_kg', v)}
                step={0.05}
                min={0.01}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Number of frosting batches needed to cover/crumb coat 1 kg of cake (default: 1.25).
              </span>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Filling Grams per kg of Cake</label>
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

            <h3 style={{ fontSize: 16, marginTop: 24, marginBottom: 14, color: 'var(--accent)' }}>Role Mappings</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Map generic quote roles (fondant, edible print, boards, boxes) to specific items in your catalog.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Fondant Ingredient</label>
              <select
                className="select"
                style={{ width: '100%' }}
                value={localSettings.fondant_ingredient_id ?? ''}
                onChange={e => handleChange('fondant_ingredient_id', e.target.value || null)}
              >
                <option value="">(None selected)</option>
                {sortedIngredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit_type})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Edible Print Item</label>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Standard Cake Box</label>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>MDF Drum Board</label>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Standard Cake Board (per extra tier)</label>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Wallpaper / Cake Wrap</label>
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

        {/* Size Guide */}
        <div className="card" style={{ background: 'var(--bg-surface)', marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 14, color: 'var(--accent)' }}>Size Guide</h3>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
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
                  display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-card)', 
                  padding: '12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' 
                }}
              >
                <div style={{ cursor: 'grab', opacity: 0.5 }}>☰</div>
                <div className="form-row form-row-3" style={{ flex: 1, gap: 12, marginBottom: 0 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Label</label>
                    <input type="text" className="input" style={{ width: '100%' }} value={sg.label} onChange={e => {
                      const newG = [...localSizeGuide];
                      newG[idx].label = e.target.value;
                      setLocalSizeGuide(newG);
                    }} placeholder='e.g. 5"' required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Weight (kg)</label>
                    <NumberInput value={sg.kg} onChange={v => {
                      const newG = [...localSizeGuide];
                      newG[idx].kg = v;
                      setLocalSizeGuide(newG);
                    }} step={0.1} min={0} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Servings</label>
                    <NumberInput value={sg.servings} onChange={v => {
                      const newG = [...localSizeGuide];
                      newG[idx].servings = v;
                      setLocalSizeGuide(newG);
                    }} step={1} min={0} />
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm btn-icon text-danger" onClick={() => {
                  setLocalSizeGuide(g => g.filter((_, i) => i !== idx));
                }}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => {
            setLocalSizeGuide(g => [...g, { label: '', kg: 0, servings: 0 }]);
          }}>+ Add Size</button>
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={() => { setLocalSettings({ ...settings }); setLocalSizeGuide([...size_guide]); }}>
            Discard Changes
          </button>
          <button type="submit" className="btn btn-primary">
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
