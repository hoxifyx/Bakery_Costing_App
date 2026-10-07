import { useMemo } from 'react';
import { useStore } from '../../store/store';
import { compute } from '../../engine';
import type { WarningCode } from '../../engine/types';

interface DataHealthPageProps {
  onNavigate?: (page: string) => void;
}

export function DataHealthPage({ onNavigate }: DataHealthPageProps) {
  const { state } = useStore();
  const { ingredients, recipes, flavours, batch_products, assembled_products } = state.data;

  // Run engine to compute global warnings
  const engineResult = useMemo(() => compute(state.data), [state.data]);
  const { all_warnings } = engineResult;

  // Specific counts required by spec §5.9:
  const unpricedIngredients = useMemo(
    () => ingredients.filter(i => i.pack_price <= 0),
    [ingredients]
  );

  const zeroLabourProducts = useMemo(() => {
    const batch = batch_products.filter(p => p.labour_hours_per_batch <= 0).map(p => ({ id: p.id, name: p.id, type: 'Batch' }));
    const assembled = assembled_products.filter(p => p.labour_hours_per_batch <= 0).map(p => ({ id: p.id, name: p.id, type: 'Assembled' }));
    return [...batch, ...assembled];
  }, [batch_products, assembled_products]);

  const zeroAddonFlavours = useMemo(
    () => flavours.filter(f => f.addon_cost_per_kg === 0),
    [flavours]
  );

  const zeroWeightRecipes = useMemo(() => {
    return recipes.filter(r => {
      const res = engineResult.recipes[r.id];
      return res && res.weight <= 0;
    });
  }, [recipes, engineResult]);

  // Group warnings by code
  const groupedWarnings = useMemo(() => {
    const groups = new Map<WarningCode, typeof all_warnings>();
    for (const w of all_warnings) {
      const list = groups.get(w.code) || [];
      list.push(w);
      groups.set(w.code, list);
    }
    return groups;
  }, [all_warnings]);

  const warningCodeLabels: Record<WarningCode, string> = {
    W_UNPRICED_INGREDIENT: 'Unpriced Ingredients',
    W_ZERO_WEIGHT_RECIPE: 'Recipes with Zero / Negative Weight',
    W_ZERO_PIECES: 'Batch Products with Zero Pieces',
    W_NO_LABOUR_HOURS: 'Products with Zero Labour Hours',
    W_NO_TIME_HOURS: 'Quote with Zero Labour Time',
    W_TIER_NO_FLAVOUR: 'Tiers Missing Flavour Selection',
    W_TIER_NO_FILLING: 'Tiers Missing Filling Selection',
    W_TIER_NO_SIZE: 'Tiers with Flavour/Filling but Zero Size',
    W_UNKNOWN_FLAVOUR: 'Tiers with Unknown Flavour Reference',
    W_UNKNOWN_FILLING: 'Tiers with Unknown Filling Reference',
    W_ADDON_ZERO: 'Flavours with Zero Add-on Cost',
    W_ROLE_NOT_SET: 'Unconfigured Settings Role Mappings',
    W_DISCOUNT_CAPPED: 'Discount Capped to Available Profit',
    W_ORDER_WITHOUT_QUOTE: 'Orders Without a Linked Quote',
    W_ORDER_PAST_DUE: 'Orders Past Due Date',
  };

  const getPageForItem = (warning: typeof all_warnings[0]): string => {
    const p = warning.path || '';
    if (p.startsWith('recipes')) return 'recipes';
    if (p.startsWith('flavours') || p.startsWith('fillings')) return 'flavours';
    if (p.startsWith('batch_products') || p.startsWith('assembled_products') || p.startsWith('products')) return 'products';
    if (p.startsWith('settings')) return 'settings';
    if (p.startsWith('ingredients')) return 'ingredients';
    if (p.startsWith('packaging')) return 'packaging';
    if (p.startsWith('order')) return 'orders';
    return 'quote';
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2>Data Health & Diagnostics</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            System-wide integrity check, audit warnings, and pricing completeness diagnostics.
          </div>
        </div>
        <div>
          {all_warnings.length === 0 ? (
            <span className="badge badge-success" style={{ padding: '8px 16px', fontSize: 14 }}>
              ✓ All Clear (0 Warnings)
            </span>
          ) : (
            <span className="badge badge-warning" style={{ padding: '8px 16px', fontSize: 14 }}>
              ⚠️ {all_warnings.length} Active Warning{all_warnings.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 16, borderLeft: unpricedIngredients.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unpriced Ingredients</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: unpricedIngredients.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {unpricedIngredients.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {unpricedIngredients.length > 0 ? 'Pack price is zero or missing' : 'All ingredients priced'}
          </div>
        </div>

        <div className="card" style={{ padding: 16, borderLeft: zeroLabourProducts.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Zero-Labour Products</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: zeroLabourProducts.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {zeroLabourProducts.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {zeroLabourProducts.length > 0 ? 'Labour hours set to 0' : 'All products have labour'}
          </div>
        </div>

        <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Flavours with Zero Add-on</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>
            {zeroAddonFlavours.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Base pricing only (no surcharge)
          </div>
        </div>

        <div className="card" style={{ padding: 16, borderLeft: zeroWeightRecipes.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Zero-Weight Recipes</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0', color: zeroWeightRecipes.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
            {zeroWeightRecipes.length}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {zeroWeightRecipes.length > 0 ? 'Yield weight is zero or negative' : 'All recipes yield &gt; 0g'}
          </div>
        </div>
      </div>

      {/* Warnings List */}
      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Detected Warnings by Category</h3>

        {all_warnings.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              Your database is completely healthy!
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 440, margin: '0 auto' }}>
              No missing references, zero-cost ingredients, unconfigured role mappings, or invalid weights detected.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {Array.from(groupedWarnings.entries()).map(([code, list]) => (
              <div key={code} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  padding: '10px 16px',
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-warning" style={{ fontSize: 11 }}>{code}</span>
                    <strong style={{ fontSize: 14 }}>{warningCodeLabels[code] || code}</strong>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{list.length} occurrence{list.length > 1 ? 's' : ''}</span>
                </div>

                <div style={{ padding: '8px 16px' }}>
                  {list.map((w, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 0',
                        borderBottom: idx < list.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: 'var(--accent-amber)' }}>⚠️</span>
                        <span>{w.context}</span>
                      </div>
                      {w.path && onNavigate && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => onNavigate(getPageForItem(w))}
                        >
                          View {getPageForItem(w)} →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
