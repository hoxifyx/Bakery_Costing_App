import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeShoppingList } from '../src/engine';
import type { AppData, ProductQuoteInput, QuoteInput, SavedQuote } from '../src/engine/types';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const rawFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtureData: AppData = rawFixture.fixture;
const quoteInput: QuoteInput = rawFixture.quote_input;

const decimal = (value: number) => new Decimal(value.toString());

function assertClose(actual: number, expected: number) {
  expect(decimal(actual).minus(decimal(expected)).abs().lte('1e-9')).toBe(true);
}

function makeSavedQuote(overrides: Partial<SavedQuote> = {}): SavedQuote {
  return {
    id: 'shopping-test',
    name: 'Shopping test',
    created_at: '2026-11-01T00:00:00.000Z',
    kind: 'cake',
    input: quoteInput,
    result_snapshot: null,
    ...overrides,
  };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
}

describe('saved quote shopping lists', () => {
  it('expands T1 cake quote into the expected ingredient quantities', () => {
    const list = computeShoppingList(fixtureData, makeSavedQuote());
    const ingredients = Object.fromEntries(list.ingredients.map(item => [item.id, item]));

    // T1: plain 2kg uses 2 cake + 2.5 frosting batches; marble 1kg splits evenly
    // across plain/chocolate (0.5 cake batch each) plus 1.25 frosting batches;
    // buttercream filling adds 150g / 300g = 0.5 batch. The jam filling is
    // 2kg × 150g/kg. Tsp amounts use each ingredient's grams_per_tsp.
    assertClose(ingredients.flour.grams, 290);
    assertClose(ingredients.sugar.grams, 575);
    assertClose(ingredients.butter.grams, 425);
    assertClose(ingredients.egg.pieces, 14.5);
    assertClose(ingredients.egg.gramEquivalent, 725);
    assertClose(ingredients.jam.grams, 300);
    assertClose(ingredients.fondant.grams, 500);
    assertClose(ingredients.salt.grams, 43.5);
    assertClose(ingredients.vanilla.grams, 21.25);
    expect(ingredients.salt.converted).toBe(true);
  });

  it('reports product production piece counts from a saved product quote', () => {
    const productQuoteInput: ProductQuoteInput = {
      lines: [
        { product_kind: 'batch', product_id: 'donut', quantity: 2, unit: 'piece' },
        { product_kind: 'batch', product_id: 'macaron', quantity: 3, unit: 'piece' },
        { product_kind: 'assembled', product_id: 'cupcake', quantity: 4, unit: 'piece' },
        { product_kind: 'assembled', product_id: 'cakepop', quantity: 5, unit: 'piece' },
      ],
      delivery: 0,
    };
    const quote = makeSavedQuote({
      kind: 'products',
      product_quote_input: productQuoteInput,
    });
    const production = Object.fromEntries(computeShoppingList(fixtureData, quote).production.map(item => [item.id, item]));

    expect(production.donut.pieces).toBe(2);
    expect(production.macaron.pieces).toBe(3);
    expect(production.cupcake.pieces).toBe(4);
    expect(production.cakepop.pieces).toBe(5);
  });

  it('returns a warning row for a deleted ingredient rather than throwing', () => {
    const dataWithDeletedIngredient: AppData = {
      ...fixtureData,
      ingredients: fixtureData.ingredients.filter(ingredient => ingredient.id !== 'flour'),
    };
    const quote = makeSavedQuote({
      input: {
        ...quoteInput,
        tiers: [
          { size_kg: 1, flavour_id: 'plain', filling_id: null },
          { size_kg: 0 },
          { size_kg: 0 },
          { size_kg: 0 },
          { size_kg: 0 },
          { size_kg: 0 },
        ],
      },
    });

    expect(() => computeShoppingList(dataWithDeletedIngredient, quote)).not.toThrow();
    expect(computeShoppingList(dataWithDeletedIngredient, quote).warnings).toContainEqual(
      expect.objectContaining({
        id: 'ingredient:flour',
        name: 'Missing ingredient (flour)',
      }),
    );
  });

  it('returns a warning row for a deleted packaging item', () => {
    const dataWithDeletedPackaging: AppData = {
      ...fixtureData,
      packaging_items: fixtureData.packaging_items.filter(item => item.id !== 'print'),
    };

    const list = computeShoppingList(dataWithDeletedPackaging, makeSavedQuote());
    expect(list.warnings).toContainEqual(
      expect.objectContaining({
        id: 'packaging:print',
        name: 'Missing packaging (print)',
      }),
    );
  });

  it('applies recipe and product waste multiplicatively to ingredient quantities', () => {
    const productId = 'donut';
    const recipeWastePct = new Decimal('0.03');
    const productWastePct = new Decimal('0.05');
    const dataWithWaste: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => recipe.id === 'dough'
        ? { ...recipe, waste_pct: recipeWastePct.toNumber() }
        : recipe),
      batch_products: fixtureData.batch_products.map(product => product.id === productId
        ? { ...product, waste_pct: productWastePct.toNumber() }
        : product),
    };
    const noWasteData: AppData = {
      ...dataWithWaste,
      recipes: dataWithWaste.recipes.map(recipe => ({ ...recipe, waste_pct: 0 })),
      batch_products: dataWithWaste.batch_products.map(product => ({ ...product, waste_pct: 0 })),
    };
    const quote = makeSavedQuote({
      kind: 'products',
      product_quote_input: {
        lines: [{ product_kind: 'batch', product_id: productId, quantity: 1, unit: 'piece' }],
        delivery: 0,
      },
    });
    const baseFlour = computeShoppingList(noWasteData, quote).ingredients.find(item => item.id === 'flour')!.grams;
    const changedFlour = computeShoppingList(dataWithWaste, quote).ingredients.find(item => item.id === 'flour')!.grams;
    const multiplier = new Decimal(1).plus(recipeWastePct).mul(new Decimal(1).plus(productWastePct));

    expect(decimal(changedFlour).minus(decimal(baseFlour).mul(multiplier)).abs().lte('1e-9')).toBe(true);
  });

  it('aggregates and sorts rows by name independently of quote-line order', () => {
    const lines: ProductQuoteInput['lines'] = [
      { product_kind: 'batch', product_id: 'donut', quantity: 2, unit: 'piece' },
      { product_kind: 'assembled', product_id: 'cupcake', quantity: 1, unit: 'piece' },
      { product_kind: 'batch', product_id: 'macaron', quantity: 3, unit: 'piece' },
    ];
    const forward = makeSavedQuote({
      kind: 'products',
      product_quote_input: { lines, delivery: 0 },
    });
    const reverse = makeSavedQuote({
      kind: 'products',
      product_quote_input: { lines: [...lines].reverse(), delivery: 0 },
    });
    const first = computeShoppingList(fixtureData, forward);
    const second = computeShoppingList(fixtureData, reverse);

    expect(first.ingredients.map(item => item.name)).toEqual([...first.ingredients.map(item => item.name)].sort((a, b) => a.localeCompare(b)));
    expect(first.packaging.map(item => item.name)).toEqual([...first.packaging.map(item => item.name)].sort((a, b) => a.localeCompare(b)));
    expect(first.production.map(item => item.name)).toEqual([...first.production.map(item => item.name)].sort((a, b) => a.localeCompare(b)));
    expect(first).toEqual(second);
  });

  it('does not mutate deeply frozen app data or the saved quote', () => {
    const frozenData = freezeDeep(structuredClone(fixtureData));
    const frozenQuote = freezeDeep(structuredClone(makeSavedQuote()));

    expect(() => computeShoppingList(frozenData, frozenQuote)).not.toThrow();
    expect(Object.isFrozen(frozenData.ingredients)).toBe(true);
    expect(Object.isFrozen(frozenQuote.input.tiers)).toBe(true);
  });
});
