import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { EMPTY_APP_DATA } from '../../src/engine/types';

describe('B6 missing settings keys should default instead of crashing compute()', () => {
  it('accepts stored settings objects missing newer fields', () => {
    const data = {
      ...EMPTY_APP_DATA,
      settings: {
        currency_code: 'BDT',
        labour_rate_per_hour: 10,
        overhead_pct: 0.25,
        target_margin: 0.3,
      } as any,
    };

    expect(() => compute(data)).not.toThrow();
  });
});
