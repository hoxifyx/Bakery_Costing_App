import { describe, expect, it } from 'vitest';
import { reducer } from '../../src/store/store';
import { EMPTY_APP_DATA, DEFAULT_SETTINGS, type AppData, type SavedQuote } from '../../src/engine/types';

const savedCakeQuote: SavedQuote = {
  id: 'quote-1',
  name: 'Cake quote',
  created_at: '2026-11-01T00:00:00.000Z',
  kind: 'cake',
  input: {
    tiers: [{ size_kg: 1, flavour_id: 'flavour-1', filling_id: 'filling-1' }],
    decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 },
  },
  result_snapshot: null,
};

const stateWith = (data: Partial<AppData>) => ({
  data: { ...EMPTY_APP_DATA, settings: { ...DEFAULT_SETTINGS }, ...data } as AppData,
} as Parameters<typeof reducer>[0]);

const ingredient = { id: 'ingredient-1', name: 'Flour', unit_type: 'g' as const, pack_quantity: 1, pack_price: 1 };
const packaging = { id: 'packaging-1', name: 'Box', price: 1 };
const recipe = { id: 'recipe-1', name: 'Recipe', kind: 'cake' as const, lines: [{ ingredient_id: 'ingredient-1', quantity: 1, unit: 'g' as const }], weight_adjustment_g: 0 };
const flavour = { id: 'flavour-1', name: 'Flavour', cost_model: { type: 'recipe' as const, cake_recipe_id: 'recipe-1', frosting_recipe_id: 'recipe-1' }, addon_cost_per_kg: 1 };
const filling = { id: 'filling-1', name: 'Filling', source: { type: 'recipe' as const, recipe_id: 'recipe-1' } };

describe('R14 deletion guards cover every referenced record (spec §3)', () => {
  it('keeps a filling referenced by a saved cake quote', () => {
    // The Fillings tab already alerts and blocks, but the guard must also hold in the reducer.
    const next = reducer(stateWith({ fillings: [filling], saved_quotes: [savedCakeQuote] }), {
      type: 'DELETE_FILLING',
      id: 'filling-1',
    });

    expect(next.data.fillings.map(item => item.id)).toEqual(['filling-1']);
  });

  it('keeps a flavour referenced by an averaged flavour', () => {
    const base = { id: 'flavour-2', name: 'Base', cost_model: { type: 'recipe' as const, cake_recipe_id: 'recipe-1', frosting_recipe_id: 'recipe-1' }, addon_cost_per_kg: 0 };
    const averaged = { id: 'flavour-3', name: 'Marble', cost_model: { type: 'average' as const, of: ['flavour-2'] }, addon_cost_per_kg: 0 };
    const next = reducer(stateWith({ flavours: [base, averaged] }), { type: 'DELETE_FLAVOUR', id: 'flavour-2' });

    expect(next.data.flavours.map(item => item.id)).toEqual(['flavour-2', 'flavour-3']);
  });

  it.each([
    ['DELETE_INGREDIENT', 'ingredient-1', 'ingredients', { ingredients: [ingredient], recipes: [recipe] }],
    ['DELETE_INGREDIENT', 'ingredient-1', 'ingredients', { ingredients: [ingredient], fillings: [{ ...filling, source: { type: 'ingredient' as const, ingredient_id: 'ingredient-1' } }] }],
    ['DELETE_PACKAGING', 'packaging-1', 'packaging_items', { packaging_items: [packaging], settings: { ...DEFAULT_SETTINGS, cake_box_item_id: 'packaging-1' } }],
    ['DELETE_RECIPE', 'recipe-1', 'recipes', { recipes: [recipe], flavours: [flavour] }],
    ['DELETE_RECIPE', 'recipe-1', 'recipes', { recipes: [recipe], fillings: [filling] }],
    ['DELETE_CUSTOMER', 'customer-1', 'customers', {
      customers: [{ id: 'customer-1', name: 'Amir' }],
      orders: [{ id: 'order-1', customer_id: 'customer-1', quote_id: null, status: 'Draft' as const }],
    }],
  ] as const)('blocks %s for a referenced %s', (type, id, group, data) => {
    const next = reducer(stateWith(data as Partial<AppData>), { type, id } as never);

    expect(next.data[group]).toHaveLength(1);
  });

  it('still deletes records that nothing references', () => {
    const next = reducer(stateWith({
      ingredients: [ingredient],
      packaging_items: [packaging],
      recipes: [recipe],
      flavours: [flavour],
      fillings: [filling],
      customers: [{ id: 'customer-1', name: 'Amir' }],
      orders: [{ id: 'order-1', customer_id: 'customer-1', quote_id: null, status: 'Draft' }],
      saved_quotes: [savedCakeQuote],
    }), { type: 'DELETE_ORDER', id: 'order-1' });

    expect(next.data.orders).toHaveLength(0);

    const withoutRecipeReferences = reducer(stateWith({ recipes: [{ ...recipe, lines: [] }] }), {
      type: 'DELETE_RECIPE',
      id: 'recipe-1',
    });
    expect(withoutRecipeReferences.data.recipes).toHaveLength(0);

    const unusedPackaging = reducer(stateWith({ packaging_items: [packaging] }), {
      type: 'DELETE_PACKAGING',
      id: 'packaging-1',
    });
    expect(unusedPackaging.data.packaging_items).toHaveLength(0);

    const unusedCustomer = reducer(stateWith({ customers: [{ id: 'customer-1', name: 'Amir' }] }), {
      type: 'DELETE_CUSTOMER',
      id: 'customer-1',
    });
    expect(unusedCustomer.data.customers).toHaveLength(0);
  });
});
