import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compute } from '../src/engine/engine';
import type { AppData } from '../src/engine/types';
import { exportAllData, parseImportFile } from '../src/io/io';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const fixtureData: AppData = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).fixture;

const decimal = (value: number) => new Decimal(value.toString());

describe('waste and spoilage costing', () => {
  it('treats zero waste as a no-op across recipes and products', () => {
    const zeroWasteData: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => ({ ...recipe, waste_pct: 0 })),
      batch_products: fixtureData.batch_products.map(product => ({ ...product, waste_pct: 0 })),
      assembled_products: fixtureData.assembled_products.map(product => ({ ...product, waste_pct: 0 })),
    };
    const baseline = compute(fixtureData);
    const zeroWaste = compute(zeroWasteData);

    for (const recipe of fixtureData.recipes) {
      expect(zeroWaste.recipes[recipe.id].raw_after_waste).toBe(baseline.recipes[recipe.id].raw);
      expect(zeroWaste.recipes[recipe.id].raw).toBe(baseline.recipes[recipe.id].raw);
      expect(zeroWaste.recipes[recipe.id].cwo).toBe(baseline.recipes[recipe.id].cwo);
    }
    for (const product of fixtureData.batch_products) {
      expect(zeroWaste.batch_products[product.id].unit_cost).toBe(baseline.batch_products[product.id].unit_cost);
      expect(zeroWaste.batch_products[product.id].waste_added).toBe(0);
    }
    for (const product of fixtureData.assembled_products) {
      expect(zeroWaste.assembled_products[product.id].unit_cost).toBe(baseline.assembled_products[product.id].unit_cost);
      expect(zeroWaste.assembled_products[product.id].waste_added).toBe(0);
    }
  });

  it('raises recipe cwo by exactly raw × waste_pct × (1 + overhead)', () => {
    const recipeId = 'cake_plain';
    const wastePct = new Decimal('0.05');
    const baseline = compute(fixtureData).recipes[recipeId];
    const changedData: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => recipe.id === recipeId
        ? { ...recipe, waste_pct: wastePct.toNumber() }
        : recipe),
    };
    const changed = compute(changedData).recipes[recipeId];
    const expectedIncrease = decimal(baseline.raw)
      .mul(wastePct)
      .mul(new Decimal(1).plus(decimal(fixtureData.settings.overhead_pct)));
    const actualIncrease = decimal(changed.cwo).minus(decimal(baseline.cwo));

    expect(decimal(changed.raw_after_waste).minus(decimal(changed.raw)).minus(decimal(baseline.raw).mul(wastePct)).abs().lte('1e-9')).toBe(true);
    expect(actualIncrease.minus(expectedIncrease).abs().lte('1e-9')).toBe(true);
    expect(changed.raw).toBe(baseline.raw);
  });

  it('applies batch-product waste to the recipe and component ingredient costs, excluding labour, other cost, and box', () => {
    const productId = 'macaron';
    const wastePct = new Decimal('0.10');
    const changedData: AppData = {
      ...fixtureData,
      batch_products: fixtureData.batch_products.map(product => product.id === productId
        ? { ...product, waste_pct: wastePct.toNumber(), overhead_pct: 0.3, other_cost_per_piece: 2 }
        : product),
    };
    const baselineData: AppData = {
      ...changedData,
      batch_products: changedData.batch_products.map(product => product.id === productId
        ? { ...product, waste_pct: 0 }
        : product),
    };
    const baseline = compute(baselineData).batch_products[productId];
    const changed = compute(changedData).batch_products[productId];
    const product = changedData.batch_products.find(item => item.id === productId)!;
    const changedResult = compute(changedData);
    const recipe = changedResult.recipes[product.recipe_id];
    const recipePartBeforeWaste = decimal(recipe.raw_after_waste)
      .mul(new Decimal(1).plus(decimal(product.overhead_pct!)))
      .div(decimal(baseline.pieces));
    const componentPartBeforeWaste = product.components.reduce(
      (total, component) => total.plus(
        decimal(changedResult.recipes[component.recipe_id].per_gram_cwo).mul(decimal(component.grams)),
      ),
      new Decimal(0),
    );
    const expectedWasteAdded = recipePartBeforeWaste.plus(componentPartBeforeWaste).mul(wastePct);

    expect(decimal(changed.unit_cost).minus(decimal(baseline.unit_cost)).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
    expect(decimal(changed.waste_added).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
    expect(decimal(changed.cost_each_excl_box).minus(decimal(baseline.cost_each_excl_box)).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
    expect(
      decimal(changed.cost_each_incl_box).minus(decimal(changed.cost_each_excl_box))
        .minus(decimal(baseline.cost_each_incl_box).minus(decimal(baseline.cost_each_excl_box)))
        .abs()
        .lte('1e-9'),
    ).toBe(true);
  });

  it('applies assembled-product waste only to component costs', () => {
    const productId = 'cupcake';
    const wastePct = new Decimal('0.10');
    const changedData: AppData = {
      ...fixtureData,
      assembled_products: fixtureData.assembled_products.map(product => product.id === productId
        ? { ...product, waste_pct: wastePct.toNumber(), other_cost_per_piece: 3 }
        : product),
    };
    const baselineData: AppData = {
      ...changedData,
      assembled_products: changedData.assembled_products.map(product => product.id === productId
        ? { ...product, waste_pct: 0 }
        : product),
    };
    const baseline = compute(baselineData).assembled_products[productId];
    const changed = compute(changedData).assembled_products[productId];
    const expectedWasteAdded = decimal(baseline.unit_cost).mul(wastePct);

    expect(decimal(changed.unit_cost).minus(decimal(baseline.unit_cost)).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
    expect(decimal(changed.waste_added).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
    expect(changed.labour_piece).toBe(baseline.labour_piece);
    expect(changed.box_piece).toBe(baseline.box_piece);
    expect(decimal(changed.cost_each).minus(decimal(baseline.cost_each)).minus(expectedWasteAdded).abs().lte('1e-9')).toBe(true);
  });

  it('applies recipe and product waste multiplicatively', () => {
    const recipeWaste = new Decimal('0.03');
    const productWaste = new Decimal('0.05');
    const changedData: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => recipe.id === 'dough'
        ? { ...recipe, waste_pct: recipeWaste.toNumber() }
        : recipe),
      batch_products: fixtureData.batch_products.map(product => product.id === 'donut'
        ? { ...product, waste_pct: productWaste.toNumber() }
        : product),
    };
    const result = compute(changedData);
    const recipe = result.recipes.dough;
    const baselineProduct = compute({
      ...changedData,
      batch_products: changedData.batch_products.map(product => product.id === 'donut'
        ? { ...product, waste_pct: 0 }
        : product),
    }).batch_products.donut;
    const changedProduct = result.batch_products.donut;
    const product = changedData.batch_products.find(item => item.id === 'donut')!;
    const expectedProductWaste = decimal(recipe.raw_after_waste)
      .mul(productWaste)
      .mul(new Decimal(1).plus(decimal(product.overhead_pct ?? changedData.settings.overhead_pct)))
      .div(decimal(changedProduct.pieces));
    const expectedCombinedRecipeRaw = decimal(recipe.raw)
      .mul(new Decimal(1).plus(recipeWaste))
      .mul(new Decimal(1).plus(productWaste));
    const additiveRecipeRaw = decimal(recipe.raw).mul(new Decimal(1).plus(recipeWaste).plus(productWaste));
    const expectedDonutUnitCost = expectedCombinedRecipeRaw
      .mul(new Decimal(1).plus(decimal(product.overhead_pct ?? changedData.settings.overhead_pct)))
      .div(decimal(changedProduct.pieces))
      .plus(decimal(product.labour_hours_per_batch).mul(decimal(changedData.settings.labour_rate_per_hour))
        .mul(new Decimal(1).plus(decimal(product.overhead_pct ?? changedData.settings.overhead_pct)))
        .div(decimal(changedProduct.pieces)));

    expect(decimal(recipe.cwo).minus(decimal(recipe.raw).mul(new Decimal(1).plus(recipeWaste)).mul(new Decimal(1).plus(decimal(changedData.settings.overhead_pct)))).abs().lte('1e-9')).toBe(true);
    expect(decimal(changedProduct.unit_cost).minus(decimal(baselineProduct.unit_cost)).minus(expectedProductWaste).abs().lte('1e-9')).toBe(true);
    expect(decimal(changedProduct.unit_cost).minus(expectedDonutUnitCost).abs().lte('1e-9')).toBe(true);
    expect(expectedCombinedRecipeRaw.minus(additiveRecipeRaw).abs().gt(0)).toBe(true);
  });

  it('warns at 50% waste for recipes and products', () => {
    const data: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => recipe.id === 'cake_plain' ? { ...recipe, waste_pct: 0.5 } : recipe),
      batch_products: fixtureData.batch_products.map(product => product.id === 'donut' ? { ...product, waste_pct: 0.5 } : product),
      assembled_products: fixtureData.assembled_products.map(product => product.id === 'cupcake' ? { ...product, waste_pct: 0.5 } : product),
    };
    const result = compute(data);

    expect(result.recipes.cake_plain.warnings.some(warning => warning.code === 'W_WASTE_HIGH')).toBe(true);
    expect(result.batch_products.donut.warnings.some(warning => warning.code === 'W_WASTE_HIGH')).toBe(true);
    expect(result.assembled_products.cupcake.warnings.some(warning => warning.code === 'W_WASTE_HIGH')).toBe(true);
  });

  it('round-trips waste settings and imports legacy exports with zero waste defaults', () => {
    const data: AppData = {
      ...fixtureData,
      recipes: fixtureData.recipes.map(recipe => recipe.id === 'cake_plain' ? { ...recipe, waste_pct: 0.05 } : recipe),
      batch_products: fixtureData.batch_products.map(product => product.id === 'donut' ? { ...product, waste_pct: 0.1 } : product),
      assembled_products: fixtureData.assembled_products.map(product => product.id === 'cupcake' ? { ...product, waste_pct: 0.2 } : product),
    };
    const exported = exportAllData(data);
    const roundTrip = parseImportFile(exported, fixtureData);

    expect(roundTrip.valid).toBe(true);
    expect(roundTrip.parsed.recipes?.find(recipe => recipe.id === 'cake_plain')?.waste_pct).toBe(0.05);
    expect(roundTrip.parsed.batch_products?.find(product => product.id === 'donut')?.waste_pct).toBe(0.1);
    expect(roundTrip.parsed.assembled_products?.find(product => product.id === 'cupcake')?.waste_pct).toBe(0.2);

    const legacy = JSON.parse(exported) as Record<string, unknown> & {
      recipes: Array<Record<string, unknown>>;
      batch_products: Array<Record<string, unknown>>;
      assembled_products: Array<Record<string, unknown>>;
    };
    legacy.schema_version = '1.4';
    for (const recipe of legacy.recipes) delete recipe.waste_pct;
    for (const product of legacy.batch_products) delete product.waste_pct;
    for (const product of legacy.assembled_products) delete product.waste_pct;
    const legacyImport = parseImportFile(JSON.stringify(legacy), fixtureData);

    expect(legacyImport.valid).toBe(true);
    expect(legacyImport.parsed.recipes?.every(recipe => recipe.waste_pct === 0)).toBe(true);
    expect(legacyImport.parsed.batch_products?.every(product => product.waste_pct === 0)).toBe(true);
    expect(legacyImport.parsed.assembled_products?.every(product => product.waste_pct === 0)).toBe(true);

    const invalid = JSON.parse(JSON.stringify(legacy)) as typeof legacy;
    invalid.recipes[0].waste_pct = -0.01;
    expect(parseImportFile(JSON.stringify(invalid), fixtureData).valid).toBe(false);
  });
});
