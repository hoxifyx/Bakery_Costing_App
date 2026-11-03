import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { compute } from '../../src/engine/engine';
import { computeAllergens, computeNutrition } from '../../src/engine/nutrition';
import { DEFAULT_SETTINGS, EMPTY_APP_DATA, type AppData, type Recipe } from '../../src/engine/types';
import { DataHealthPage } from '../../src/ui/pages/DataHealthPage';

const computeSpy = vi.hoisted(() => vi.fn());
vi.mock('../../src/engine/engine', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/engine/engine')>();
  return {
    ...actual,
    compute: (...args: Parameters<typeof actual.compute>) => {
      computeSpy(...args);
      return actual.compute(...args);
    },
  };
});

const dataForHealth = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('../../src/store/store', () => ({
  useStore: () => ({ state: { data: dataForHealth.data } }),
}));

describe('F8 Data Health repeated engine work and summary fields', () => {
  it('reuses a precomputed engine result for nutrition and allergen checks', () => {
    const data: AppData = {
      ...EMPTY_APP_DATA,
      recipes: [{
        id: 'recipe-1',
        name: 'Recipe',
        kind: 'cake',
        lines: [],
        weight_adjustment_g: 0,
      }],
    };
    const result = compute(data);
    computeSpy.mockClear();

    expect(() => computeNutrition(data, 'recipe-1', result)).not.toThrow();
    expect(() => computeAllergens(data, 'recipe-1', result)).not.toThrow();
    expect(computeSpy).not.toHaveBeenCalled();
  });

  it('compares 200-recipe timings before and after reusing a precomputed result', () => {
    const recipes: Recipe[] = Array.from({ length: 200 }, (_, index) => ({
      id: `recipe-${index}`,
      name: `Recipe ${index}`,
      kind: 'cake',
      lines: [],
      weight_adjustment_g: 0,
    }));
    const data: AppData = { ...EMPTY_APP_DATA, recipes };
    const baselineNutritionStart = performance.now();
    for (const recipe of recipes) computeNutrition(data, recipe.id);
    const baselineNutritionMs = performance.now() - baselineNutritionStart;
    const baselineAllergenStart = performance.now();
    for (const recipe of recipes) computeAllergens(data, recipe.id);
    const baselineAllergenMs = performance.now() - baselineAllergenStart;

    const result = compute(data);
    const nutritionStart = performance.now();
    for (const recipe of recipes) computeNutrition(data, recipe.id, result);
    const nutritionMs = performance.now() - nutritionStart;
    const allergenStart = performance.now();
    for (const recipe of recipes) computeAllergens(data, recipe.id, result);
    const allergenMs = performance.now() - allergenStart;

    process.stdout.write(`F8 / 200 recipes: before=${(baselineNutritionMs + baselineAllergenMs).toFixed(1)}ms (nutrition=${baselineNutritionMs.toFixed(1)}ms, allergens=${baselineAllergenMs.toFixed(1)}ms); after=${(nutritionMs + allergenMs).toFixed(1)}ms (nutrition=${nutritionMs.toFixed(1)}ms, allergens=${allergenMs.toFixed(1)}ms)\n`);
    expect(Number.isFinite(baselineNutritionMs + baselineAllergenMs + nutritionMs + allergenMs)).toBe(true);
  }, 30000);

  it('counts zero-quantity ingredients as unpriced and uses product display names', () => {
    dataForHealth.data = {
      ...EMPTY_APP_DATA,
      settings: { ...DEFAULT_SETTINGS },
      ingredients: [{
        id: 'bad-quantity',
        name: 'Zero quantity flour',
        unit_type: 'g',
        pack_quantity: 0,
        pack_price: 100,
      }],
      batch_products: [{
        id: 'batch-id',
        name: 'Display Batch Name',
        recipe_id: 'missing-recipe',
        pieces_mode: 'fixed',
        fixed_pieces: 1,
        labour_hours_per_batch: 0,
        components: [],
        box_id: null,
        pieces_per_box: 1,
        show_each_including_box: true,
      }],
    };
    const markup = renderToString(React.createElement(DataHealthPage));

    expect.soft(markup).toMatch(/Unpriced Ingredients<\/div><div class="text-headline-xl"[^>]*>1<\/div><div class="text-body-md">Pack price is zero or missing/);
    expect.soft(markup).toContain('Display Batch Name</li>');
  });
});
