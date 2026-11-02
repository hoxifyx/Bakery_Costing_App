import { describe, expect, it } from 'vitest';
import { computeIngredientPriceImpact } from '../src/engine/impact';
import { localDateString } from '../src/engine/utils';
import { EMPTY_APP_DATA, type AppData, type Ingredient } from '../src/engine/types';
import { reducer, type StoreState } from '../src/store/store';
import { recordIngredientPriceChange } from '../src/store/ingredientPriceHistory';

const ingredient: Ingredient = {
  id: 'flour',
  name: 'Flour',
  unit_type: 'g',
  pack_quantity: 1000,
  pack_price: 100,
};

describe('ingredient price history', () => {
  const importState = (currentIngredient: Ingredient): StoreState => ({
    data: { ...EMPTY_APP_DATA, ingredients: [currentIngredient] },
    undoSnapshot: null,
    quoteInput: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 } },
    productQuoteInput: { lines: [], delivery: 0 },
    activeSavedQuote: null,
    loading: false,
    saving: false,
    lastSaved: null,
    cloud: {
      configured: false,
      signedIn: false,
      user: null,
      lastBackupAt: null,
      lastBackupFileId: null,
      busy: false,
      error: null,
    },
  });

  it('does not synthesize price history when restoring with replace mode', () => {
    const imported = { ...ingredient, pack_price: 120 };
    const result = reducer(importState(ingredient), {
      type: 'IMPORT_DATA',
      data: { ingredients: [imported] },
      mode: 'replace',
    });

    expect(result.data.ingredients[0].price_history).toBeUndefined();
  });

  it.each(['replace_selected', 'merge'] as const)('appends history for %s imports', mode => {
    const imported = { ...ingredient, pack_price: 120 };
    const result = reducer(importState(ingredient), {
      type: 'IMPORT_DATA',
      data: { ingredients: [imported] },
      mode,
    });

    expect(result.data.ingredients[0].price_history).toEqual([{
      date: localDateString(),
      pack_quantity: 1000,
      pack_price: 120,
    }]);

    const unchanged = reducer(importState(result.data.ingredients[0]), {
      type: 'IMPORT_DATA',
      data: { ingredients: [result.data.ingredients[0]] },
      mode,
    });
    expect(unchanged.data.ingredients[0].price_history).toHaveLength(1);
  });

  it('seeds old and new prices on the first edit so impact is immediately available', () => {
    const data: AppData = {
      ...EMPTY_APP_DATA,
      ingredients: [ingredient],
      recipes: [{
        id: 'recipe',
        name: 'Flour recipe',
        kind: 'cake',
        lines: [{ ingredient_id: ingredient.id, quantity: 1000, unit: 'g' }],
        weight_adjustment_g: 0,
      }],
    };
    const updatedIngredient = recordIngredientPriceChange(ingredient, { ...ingredient, pack_price: 200 });
    const history = updatedIngredient.price_history ?? [];

    expect(history).toHaveLength(2);
    expect(history.map(entry => [entry.pack_quantity, entry.pack_price])).toEqual([[1000, 100], [1000, 200]]);
    expect(history.map(entry => entry.date)).toEqual([localDateString(), localDateString()]);

    const impact = computeIngredientPriceImpact({
      ...data,
      ingredients: [updatedIngredient],
    }, ingredient.id, { fromEntryIndex: 0 });
    expect(impact).not.toBeNull();
    expect(impact?.items).toHaveLength(1);
  });
});