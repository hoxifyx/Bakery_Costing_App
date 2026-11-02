import { describe, expect, it } from 'vitest';
import type { SavedQuote } from '../src/engine/types';
import { getFillingUsedIn } from '../src/ui/quoteReferences';

describe('saved quote filling references', () => {
  it('returns quotes that reference a filling', () => {
    const quote: SavedQuote = {
      id: 'quote-1',
      name: 'Birthday cake',
      created_at: '2026-11-02T00:00:00.000Z',
      input: {
        tiers: [{ size_kg: 1, filling_id: 'jam' }],
        decoration: {
          fondant_kg: 0,
          prints: 0,
          flowers: 0,
          toppers: 0,
          time_hours: 0,
          others: 0,
          delivery: 0,
        },
      },
      result_snapshot: null,
    };
    const unrelated = { ...quote, id: 'quote-2', name: 'Plain cake', input: { ...quote.input, tiers: [{ size_kg: 1 }] } };

    expect(getFillingUsedIn('jam', [quote, unrelated])).toEqual([quote]);
  });
});
