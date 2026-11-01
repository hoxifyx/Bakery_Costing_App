import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compute, computeWhatIf } from '../src/engine';
import type { AppData } from '../src/engine/types';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const fixtureData: AppData = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).fixture;
const decimal = (value: number) => new Decimal(value.toString());

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('what-if scratchpad calculations', () => {
  it('matches compute output for a product with no overrides', () => {
    const quantity = 3;
    const productId = 'donut';
    const engine = compute(fixtureData).batch_products[productId];
    const result = computeWhatIf(fixtureData, {
      source: 'batch_product',
      itemId: productId,
      quantity,
      unit: 'piece',
    });
    const expectedPrice = engine.my_price_each ?? engine.headline_each;

    expect(decimal(result.unitCost).minus(decimal(engine.cost_each)).abs().lte('1e-9')).toBe(true);
    expect(decimal(result.unitPrice).minus(decimal(expectedPrice)).abs().lte('1e-9')).toBe(true);
    expect(decimal(result.totalPrice).minus(decimal(expectedPrice).mul(quantity)).abs().lte('1e-9')).toBe(true);
  });

  it('applies a margin override using compute output with the overridden target margin', () => {
    const recipeId = 'cake_plain';
    const margin = 0.4;
    const overriddenData: AppData = {
      ...fixtureData,
      settings: { ...fixtureData.settings, target_margin: margin },
    };
    const recipeCost = compute(overriddenData).recipes[recipeId].cwo;
    const result = computeWhatIf(fixtureData, {
      source: 'recipe',
      itemId: recipeId,
      quantity: 1,
      unit: 'batch',
      marginOverride: margin,
    });
    const expectedPrice = decimal(recipeCost).div(new Decimal(1).minus(decimal(margin)));

    expect(decimal(result.unitPrice).minus(expectedPrice).abs().lte('1e-9')).toBe(true);
  });

  it('returns a warning and zero price for kg pricing on a non-cake recipe', () => {
    const result = computeWhatIf(fixtureData, {
      source: 'recipe',
      itemId: 'buttercream',
      quantity: 1,
      unit: 'kg',
    });

    expect(result.unitPrice).toBe(0);
    expect(result.warnings.some(warning => warning.code === 'W_ZERO_WEIGHT_RECIPE' && warning.context.includes('only available for cake recipes'))).toBe(true);
  });

  it('does not mutate deeply frozen input data', () => {
    const frozenData = deepFreeze(structuredClone(fixtureData));

    expect(() => computeWhatIf(frozenData, {
      source: 'batch_product',
      itemId: 'donut',
      quantity: 2,
      unit: 'piece',
      marginOverride: 0.4,
      overheadOverride: 0.25,
      labourRateOverride: 300,
    })).not.toThrow();
    expect(Object.isFrozen(frozenData.settings)).toBe(true);
    expect(Object.isFrozen(frozenData.batch_products[0])).toBe(true);
  });

  it('returns zero totals for zero quantity', () => {
    const result = computeWhatIf(fixtureData, {
      source: 'recipe',
      itemId: 'cake_plain',
      quantity: 0,
      unit: 'batch',
    });

    expect(result.totalCost).toBe(0);
    expect(result.totalPrice).toBe(0);
    expect(Number.isFinite(result.totalPrice)).toBe(true);
  });

  it('displaces a product labour-rate override for the scratchpad computation only', () => {
    const productId = 'donut';
    const dataWithProductRate: AppData = {
      ...fixtureData,
      batch_products: fixtureData.batch_products.map(product => product.id === productId
        ? { ...product, labour_rate_per_hour: 500 }
        : product),
    };
    const expectedData: AppData = {
      ...dataWithProductRate,
      batch_products: dataWithProductRate.batch_products.map(product => product.id === productId
        ? { ...product, labour_rate_per_hour: 300 }
        : product),
    };
    const expected = compute(expectedData).batch_products[productId];
    const result = computeWhatIf(dataWithProductRate, {
      source: 'batch_product',
      itemId: productId,
      quantity: 1,
      unit: 'piece',
      labourRateOverride: 300,
    });

    expect(decimal(result.unitPrice).minus(decimal(expected.my_price_each ?? expected.headline_each)).abs().lte('1e-9')).toBe(true);
    expect(result.displacedOverrides.labourRate).toEqual({
      globalValue: fixtureData.settings.labour_rate_per_hour,
      productValue: 500,
    });
  });
});
