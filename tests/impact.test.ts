import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compute } from '../src/engine/engine';
import { computeIngredientPriceImpact } from '../src/engine/impact';
import type { AppData } from '../src/engine/types';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const fixtureData: AppData = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).fixture;

function dataWithFlourHistory(fromPrice: number, toPrice: number): AppData {
  return {
    ...fixtureData,
    ingredients: fixtureData.ingredients.map(ingredient => ingredient.id === 'flour'
      ? {
          ...ingredient,
          price_history: [
            { date: '2026-10-01', pack_quantity: ingredient.pack_quantity, pack_price: fromPrice },
            { date: '2026-10-15', pack_quantity: ingredient.pack_quantity, pack_price: toPrice },
          ],
        }
      : ingredient),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('ingredient price impact', () => {
  it('compares computations across history entries and includes indirect dependents in category/name order', () => {
    const data = dataWithFlourHistory(100, 200);
    const impact = computeIngredientPriceImpact(data, 'flour', { fromEntryIndex: 0 });

    expect(impact?.from.pack_price).toBe(100);
    expect(impact?.to.pack_price).toBe(200);
    const idsByCategory = (category: string) =>
      impact?.items.filter(item => item.category === category).map(item => item.id);
    expect(idsByCategory('Recipe')).toEqual(['cake_choc', 'dough', 'cake_plain', 'shell']);
    expect(idsByCategory('Filling')).toEqual([]);
    expect(idsByCategory('Batch product')).toEqual(['donut', 'macaron']);
    expect(idsByCategory('Assembled product')).toEqual(['cakepop', 'cupcake']);

    const plainRecipe = impact!.items.find(item => item.id === 'cake_plain')!;
    const plainCost = plainRecipe.metrics[0];
    const oldData = {
      ...data,
      ingredients: data.ingredients.map(ingredient => ingredient.id === 'flour'
        ? { ...ingredient, pack_price: 100 }
        : ingredient),
    };
    expect(plainCost.newValue - plainCost.oldValue).toBeCloseTo(12.5 / compute(oldData).recipes.cake_plain.weight, 8);

    const cakepop = impact!.items.find(item => item.id === 'cakepop')!;
    expect(cakepop.metrics.some(metric => metric.delta !== 0)).toBe(true);
  });

  it('returns no impact when history has fewer than two entries', () => {
    const noHistory = { ...fixtureData, ingredients: fixtureData.ingredients.map(ingredient =>
      ingredient.id === 'flour' ? { ...ingredient, price_history: [] } : ingredient,
    ) };
    const oneEntry = { ...fixtureData, ingredients: fixtureData.ingredients.map(ingredient =>
      ingredient.id === 'flour'
        ? { ...ingredient, price_history: [{ date: '2026-10-01', pack_quantity: 1000, pack_price: 100 }] }
        : ingredient,
    ) };

    expect(computeIngredientPriceImpact(noHistory, 'flour', { fromEntryIndex: 0 })).toBeNull();
    expect(computeIngredientPriceImpact(oneEntry, 'flour', { fromEntryIndex: 0 })).toBeNull();
  });

  it('does not mutate the deeply frozen input data', () => {
    const data = deepFreeze(dataWithFlourHistory(100, 200));
    const before = JSON.stringify(data);

    expect(() => computeIngredientPriceImpact(data, 'flour', { fromEntryIndex: 0 })).not.toThrow();
    expect(JSON.stringify(data)).toBe(before);
  });

  it('does not produce a percentage when the previous cost is zero', () => {
    const data = dataWithFlourHistory(0, 100);
    data.ingredients = data.ingredients.map(ingredient => ingredient.id === 'flour'
      ? ingredient
      : { ...ingredient, pack_price: 0 });
    const impact = computeIngredientPriceImpact(data, 'flour', { fromEntryIndex: 0 });
    const recipeMetric = impact?.items.find(item => item.id === 'cake_plain')?.metrics[0];

    expect(recipeMetric?.oldValue).toBe(0);
    expect(recipeMetric?.percentageDelta).toBeNull();
  });
});
