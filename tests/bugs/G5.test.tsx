import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA } from '../../src/engine/types';
import { compute } from '../../src/engine/engine';
import { parseImportFile } from '../../src/io/io';
import { QuotePage } from '../../src/ui/pages/QuotePage';

const mocked = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('../../src/store/store', () => ({
  useStore: () => ({ state: mocked.state, dispatch: vi.fn() }),
}));

describe('G5 imported snapshots and size guides', () => {
  it('rejects invalid size-guide values and malformed saved result snapshots', () => {
    const data = {
      ...EMPTY_APP_DATA,
      size_guide: [{ label: 'Large', kg: -1, servings: Infinity }],
      saved_quotes: [{
        id: 'saved-1',
        name: 'Quote',
        created_at: '2026-01-01',
        input: {
          tiers: [],
          decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 },
        },
        result_snapshot: { margin_check: 'bad', total_price: null },
      }],
    };
    const preview = parseImportFile(JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.6',
      ...data,
    }), EMPTY_APP_DATA);

    expect(preview.valid).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it('renders incomplete saved snapshots defensively and does not compare to live settings', () => {
    const data = { ...EMPTY_APP_DATA, settings: { ...DEFAULT_SETTINGS, target_margin: 0.9 } };
    const quoteInput = {
      tiers: Array.from({ length: 6 }, (_, index) => ({
        size_kg: index === 0 ? 1 : 0,
        flavour_id: null,
        filling_id: null,
      })),
      decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0, discount: 0 },
    };
    const computed = compute(data, quoteInput).quote;
    expect(computed).not.toBeNull();
    const snapshot = { ...computed!, margin_check: 0.5 };
    expect([
      snapshot.tier_cost, snapshot.tiers_used, snapshot.decoration_sum, snapshot.fondant,
      snapshot.print, snapshot.flowers, snapshot.topper, snapshot.time, snapshot.others,
      snapshot.delivery, snapshot.overhead, snapshot.packaging, snapshot.total_cost,
      snapshot.profit, snapshot.discount, snapshot.total_price, snapshot.margin_check,
    ].every(Number.isFinite)).toBe(true);
    expect(Array.isArray(snapshot.tier_details)).toBe(true);
    expect(Array.isArray(snapshot.warnings)).toBe(true);
    expect(Array.isArray(snapshot.audit)).toBe(true);
    expect(snapshot.target_margin).toBeUndefined();
    const quoteState = {
      data,
      quoteInput,
      activeSavedQuote: { id: 'saved-1', name: 'Saved', snapshot, isRecalculated: false },
    };
    mocked.state = quoteState;
    quoteState.activeSavedQuote.snapshot = { margin_check: 0.5 };
    expect(() => renderToString(React.createElement(QuotePage))).not.toThrow();
    quoteState.activeSavedQuote.snapshot = snapshot;
    const html = renderToString(React.createElement(QuotePage));
    expect(html).toMatch(/50\.0<!-- -->%/);
    expect(html).not.toContain('Under Target');
    expect(html).not.toContain('Healthy Margin');

    quoteState.activeSavedQuote.snapshot = { ...snapshot, target_margin: 0.4 };
    const targetHtml = renderToString(React.createElement(QuotePage));
    expect(targetHtml).toContain('Ready');
    expect(targetHtml).toMatch(/40<!-- -->%/);
  });
});
