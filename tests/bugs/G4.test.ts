import { describe, expect, it } from 'vitest';
import { displayPriceHistoryDate, recordIngredientPriceChange } from '../../src/store/ingredientPriceHistory';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { exportAllData, parseImportFile } from '../../src/io/io';

describe('G4 first manual ingredient price edit', () => {
  it('marks the seeded previous price as earlier rather than assigning today as its date', () => {
    const result = recordIngredientPriceChange(
      { id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 100 },
      { id: 'flour', name: 'Flour', unit_type: 'g', pack_quantity: 1000, pack_price: 120 },
    );

    expect(result.price_history).toHaveLength(2);
    expect(result.price_history?.[0].date).toBe('');
    expect(result.price_history?.[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(displayPriceHistoryDate(result.price_history?.[0].date)).toBe('Earlier');
    expect(displayPriceHistoryDate(result.price_history?.[1].date)).toBe(result.price_history?.[1].date);
  });

  it('continues importing dated price history from older exports', () => {
    const oldDate = '2024-02-29';
    const text = exportAllData({
      ...EMPTY_APP_DATA,
      ingredients: [{
        id: 'flour',
        name: 'Flour',
        unit_type: 'g',
        pack_quantity: 1000,
        pack_price: 120,
        price_history: [{ date: oldDate, pack_quantity: 1000, pack_price: 100 }],
      }],
    });
    const preview = parseImportFile(text, EMPTY_APP_DATA);

    expect(preview.valid).toBe(true);
    expect(preview.parsed.ingredients?.[0].price_history?.[0].date).toBe(oldDate);
  });
});
