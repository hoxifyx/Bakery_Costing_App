import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeNutrition } from '../../src/engine/nutrition';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import type { ShoppingList } from '../../src/engine/shopping';
import {
  downloadBlob,
  downloadJSON,
  exportIngredientsCSV,
  exportPackagingCSV,
  importIngredientsCSV,
  isJsonFileName,
  parseCSV,
} from '../../src/io/io';
import { shoppingListToCsv } from '../../src/io/shoppingListCsv';
import { displayWastePercent, sizeGuideKey } from '../../src/ui/utils';

describe('G8 small correctness and release hygiene fixes', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates stable distinct keys for duplicate and empty size-guide labels', () => {
    expect(new Set([
      sizeGuideKey(0, ''),
      sizeGuideKey(1, ''),
      sizeGuideKey(2, 'Large'),
      sizeGuideKey(3, 'Large'),
    ]).size).toBe(4);
  });

  it('rounds waste input display values without modifying stored values', () => {
    const storedWaste = 0.07000000000000001;
    expect(displayWastePercent(storedWaste)).toBe(7);
    expect(storedWaste).toBe(0.07000000000000001);
  });

  it('defers URL revocation after JSON and blob downloads', async () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { createElement: () => anchor });

    downloadJSON('{"ok":true}', 'backup.json');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    revokeObjectURL.mockClear();
    downloadBlob(new Blob(['csv']), 'data.csv');
    expect(anchor.click).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('accepts JSON file extensions without case sensitivity', () => {
    expect(isJsonFileName('backup.JSON')).toBe(true);
    expect(isJsonFileName('backup.json')).toBe(true);
    expect(isJsonFileName('backup.json.tmp')).toBe(false);
  });

  it('neutralizes formula-leading shopping-list text cells but preserves numeric and data CSV cells', () => {
    const list: ShoppingList = {
      ingredients: [{
        id: 'flour',
        name: '=2+2',
        grams: -12,
        pieces: 2,
        gramEquivalent: 0,
        teaspoons: 0,
        converted: false,
      }],
      packaging: [{ id: 'box', name: '+Box', quantity: 3 }],
      production: [{ id: 'batch', name: '@Cake', productKind: 'batch', pieces: 4 }],
      warnings: [{
        id: 'warning',
        name: '-Missing',
        message: '=HYPERLINK("https://example.invalid")',
        category: 'ingredient',
      }],
    };
    const csv = shoppingListToCsv(list);
    const rows = parseCSV(csv);
    expect(rows[0]?.name).toBe("'=2+2");
    expect(rows[0]?.grams).toBe('-12');
    expect(rows[1]?.name).toBe("'+Box");
    expect(rows[2]?.name).toBe("'@Cake");
    expect(rows[3]?.name).toBe("'-Missing");
    expect(rows[3]?.warning).toBe("'=HYPERLINK(\"https://example.invalid\")");

    const ingredient = {
      id: 'sugar',
      name: '=Sugar',
      unit_type: 'g' as const,
      pack_quantity: 1000,
      pack_price: 20,
      notes: '',
    };
    const ingredientCsv = exportIngredientsCSV([ingredient]);
    expect(parseCSV(ingredientCsv)[0]?.name).toBe('=Sugar');
    expect(importIngredientsCSV(ingredientCsv, [], false).items[0]?.name).toBe('=Sugar');
    const packagingCsv = exportPackagingCSV([{ id: 'box', name: '+Box', price: 5 }]);
    expect(parseCSV(packagingCsv)[0]?.name).toBe('+Box');
  });

  it('excludes free lines and the weight adjustment from partial-nutrition warnings', () => {
    const data = {
      ...EMPTY_APP_DATA,
      recipes: [{
        id: 'recipe',
        name: 'Cake',
        kind: 'cake' as const,
        lines: [
          { ingredient_id: null, label: 'Water', quantity: 100, unit: 'g' as const },
          { ingredient_id: null, label: 'Free decoration', quantity: 5, unit: 'g' as const },
          { ingredient_id: 'flour', quantity: 10, unit: 'g' as const },
        ],
        weight_adjustment_g: 5,
      }],
      ingredients: [{
        id: 'flour',
        name: 'Flour',
        unit_type: 'g' as const,
        pack_quantity: 1000,
        pack_price: 100,
      }],
    };
    const result = computeNutrition(data, 'recipe');
    expect(result.warnings[0]?.context).toContain('Flour');
    expect(result.warnings[0]?.context).not.toContain('Water');
    expect(result.warnings[0]?.context).not.toContain('Free decoration');
    expect(result.warnings[0]?.context).not.toContain('Recipe weight adjustment');
  });
});
