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
    <>
      <div className="quote-header">
        <div className="quote-header-main">
          <div className="quote-breadcrumbs">
            <span className="quote-crumb-accent">Tools</span>
            <span className="quote-crumb-sep">/</span>
            <span className="quote-crumb-tertiary">Data Health</span>
          </div>
          <div className="quote-title-row">
            <h1 className="quote-title">Data Health</h1>
            {all_warnings.length === 0 ? (
              <span className="badge badge-green" style={{ fontSize: 12, padding: '4px 10px' }}>
                <span className="material-symbols-outlined ms-14" aria-hidden>check_circle</span>
                All Clear
              </span>
            ) : (
              <span className="badge badge-amber" style={{ fontSize: 12, padding: '4px 10px' }}>
                <span className="material-symbols-outlined ms-14" aria-hidden>warning</span>
                {all_warnings.length} Warning{all_warnings.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="quote-page-root">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          <div className="quote-section-card" style={{ padding: 16, gap: 6, borderLeft: unpricedIngredients.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
            <div className="text-label-caps">Unpriced Ingredients</div>
            <div className="text-headline-xl" style={{ color: unpricedIngredients.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {unpricedIngredients.length}
            </div>
            <div className="text-body-md">{unpricedIngredients.length > 0 ? 'Pack price is zero or missing' : 'All ingredients priced'}</div>
          </div>

          <div className="quote-section-card" style={{ padding: 16, gap: 6, borderLeft: zeroLabourProducts.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
            <div className="text-label-caps">Zero-Labour Products</div>
            <div className="text-headline-xl" style={{ color: zeroLabourProducts.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {zeroLabourProducts.length}
            </div>
            <div className="text-body-md">{zeroLabourProducts.length > 0 ? 'Labour hours set to 0' : 'All products have labour'}</div>
          </div>

          <div className="quote-section-card" style={{ padding: 16, gap: 6, borderLeft: '3px solid var(--border)' }}>
            <div className="text-label-caps">Flavours with Zero Add-on</div>
            <div className="text-headline-xl" style={{ fontVariantNumeric: 'tabular-nums' }}>{zeroAddonFlavours.length}</div>
            <div className="text-body-md">Base pricing only (no surcharge)</div>
          </div>

          <div className="quote-section-card" style={{ padding: 16, gap: 6, borderLeft: zeroWeightRecipes.length > 0 ? '3px solid var(--accent-amber)' : '3px solid var(--accent-green)' }}>
            <div className="text-label-caps">Zero-Weight Recipes</div>
            <div className="text-headline-xl" style={{ color: zeroWeightRecipes.length > 0 ? 'var(--accent-amber)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {zeroWeightRecipes.length}
            </div>
            <div className="text-body-md">{zeroWeightRecipes.length > 0 ? 'Yield weight is zero or negative' : 'All recipes yield &gt; 0g'}</div>
          </div>
        </div>

        <div className="quote-section-card">
          <div className="decorations-section-header">
            <div className="decorations-header-left">
              <span className="material-symbols-outlined ms-20" aria-hidden>warning</span>
              <h2 className="decorations-header-title">Detected Warnings by Category</h2>
            </div>
            <span className="decorations-header-right">{all_warnings.length} total</span>
          </div>

          {all_warnings.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-icon">
                <span className="material-symbols-outlined ms-32" aria-hidden>verified_user</span>
              </div>
              <div className="empty-state-title">Your database is completely healthy!</div>
              <div className="empty-state-text">
                No missing references, zero-cost ingredients, unconfigured role mappings, or invalid weights detected.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from(groupedWarnings.entries()).map(([code, list]) => (
                <div key={code} className="quote-section-card" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
                  <div className="decorations-section-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div className="decorations-header-left">
                      <span className="material-symbols-outlined ms-18" aria-hidden>warning</span>
                      <span className="badge badge-amber" style={{ fontSize: 11 }}>{code}</span>
                      <h3 className="decorations-header-title">{warningCodeLabels[code] || code}</h3>
                    </div>
                    <span className="decorations-header-right">{list.length} occurrence{list.length !== 1 ? 's' : ''}</span>
                  </div>

                  <div style={{ padding: '8px 16px' }}>
                    {list.map((w, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 0',
                          borderBottom: idx < list.length - 1 ? '1px solid var(--border)' : 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                          flexWrap: 'wrap',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 240px', lineHeight: 1.5 }}>
                          <span className="material-symbols-outlined ms-16" style={{ color: 'var(--accent-amber)', flexShrink: 0 }} aria-hidden>warning</span>
                          <span style={{ overflowWrap: 'anywhere' }}>{w.context}</span>
                        </div>
                        {w.path && onNavigate && (
                          <button
                            type="button"
                            className="quote-toolbar-btn"
                            style={{ flexShrink: 0 }}
                            onClick={() => onNavigate(getPageForItem(w))}
                          >
                            <span>View {getPageForItem(w)}</span>
                            <span className="material-symbols-outlined ms-16" aria-hidden>arrow_forward</span>
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
    </>
  );
}
