import { describe, expect, it } from 'vitest';
import { importIngredientsCSV } from '../../src/io/io';
import type { Ingredient } from '../../src/engine/types';

describe('F5 generated ingredient IDs are unique', () => {
  it('disambiguates new names with the same slug against existing and new IDs', () => {
    const existing: Ingredient[] = [{
      id: 'sugar',
      name: 'Other sugar',
      unit_type: 'g',
      pack_quantity: 1000,
      pack_price: 100,
    }];
    const result = importIngredientsCSV(
      'id,name,unit_type,pack_quantity,pack_price\n,Sugar!,g,100,10\n,Sugar?,g,100,12\n',
      existing,
    );

    expect(result.errors).toEqual([]);
    expect(result.items.map(item => item.id)).toEqual(['sugar', 'sugar_2', 'sugar_3']);
    expect(new Set(result.items.map(item => item.id)).size).toBe(result.items.length);
    expect(result.items.every(item => /^[a-z0-9_-]{1,64}$/.test(item.id))).toBe(true);
  });
});
