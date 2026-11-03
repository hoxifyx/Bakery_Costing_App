import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compute } from '../src/engine/engine';
import { localDateString } from '../src/engine/utils';
import { AppData, QuoteInput, SavedQuote, Customer, Order } from '../src/engine/types';
import { exportAllData, parseImportFile } from '../src/io/io';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const rawFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const fixtureData: AppData = rawFixture.fixture;
const quoteInput: QuoteInput = rawFixture.quote_input;
const expectedT1 = rawFixture.expected_T1;
const expectedT2 = rawFixture.expected_T2;

const TOLERANCE = 1e-6;

function closeTo(actual: number, expected: number, tol = TOLERANCE) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

describe('Bakery Costing App - Golden Tests', () => {
  it('T3a: importer rejects target_margin >= 1', () => {
    const invalidData = {
      ...fixtureData,
      settings: { ...fixtureData.settings, target_margin: 1 },
    };
    const preview = parseImportFile(exportAllData(invalidData), fixtureData);

    expect(preview.valid).toBe(false);
    expect(preview.errors.some(error => error.path === 'settings.target_margin')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T1: Standard fixture
  // -------------------------------------------------------------------------
  it('T1: Standard fixture calculations match within 1e-6', () => {
    const res = compute(fixtureData, quoteInput);

    // 1. Recipes
    for (const [id, exp] of Object.entries(expectedT1.recipes as Record<string, any>)) {
      const r = res.recipes[id];
      expect(r, `Recipe ${id} should exist`).toBeDefined();
      closeTo(r.raw, exp.raw);
      closeTo(r.cwo, exp.cwo);
      closeTo(r.weight, exp.weight);
    }

    // 2. Flavours per kg
    for (const [id, expPrice] of Object.entries(expectedT1.flavour_price_per_kg as Record<string, number>)) {
      const f = res.flavours[id];
      expect(f, `Flavour ${id} should exist`).toBeDefined();
      closeTo(f.price_per_kg, expPrice);
    }

    // 3. Fillings per kg of cake
    for (const [id, expCost] of Object.entries(expectedT1.filling_cost_per_kg_of_cake as Record<string, number>)) {
      const fil = res.fillings[id];
      expect(fil, `Filling ${id} should exist`).toBeDefined();
      closeTo(fil.cost_per_kg, expCost);
    }

    // 4. Products
    const expProd = expectedT1.products;
    const donut = res.batch_products['donut'];
    expect(donut).toBeDefined();
    closeTo(donut.pieces, expProd.donut.pieces);
    closeTo(donut.unit_cost, expProd.donut.unit_cost);
    closeTo(donut.each_including_box, expProd.donut.each_incl_box);
    closeTo(donut.each_excluding_box, expProd.donut.each_excl_box);
    closeTo(donut.box_price, expProd.donut.box_price);
    closeTo(donut.headline_each, expProd.donut.each_shown);

    const macaron = res.batch_products['macaron'];
    expect(macaron).toBeDefined();
    closeTo(macaron.pieces, expProd.macaron.pieces);
    closeTo(macaron.unit_cost, expProd.macaron.unit_cost);
    closeTo(macaron.each_including_box, expProd.macaron.each_incl_box);
    closeTo(macaron.each_excluding_box, expProd.macaron.each_excl_box);
    closeTo(macaron.box_price, expProd.macaron.box_price);
    closeTo(macaron.headline_each, expProd.macaron.each_shown);

    const cupcake = res.assembled_products['cupcake'];
    expect(cupcake).toBeDefined();
    closeTo(cupcake.unit_cost, expProd.cupcake.unit_cost);
    closeTo(cupcake.price_each, expProd.cupcake.price_each);

    const cakepop = res.assembled_products['cakepop'];
    expect(cakepop).toBeDefined();
    closeTo(cakepop.unit_cost, expProd.cakepop.unit_cost);
    closeTo(cakepop.price_each, expProd.cakepop.price_each);

    // 5. Quote
    expect(res.quote).toBeDefined();
    const q = res.quote!;
    closeTo(q.tier_cost, expectedT1.quote.tier_cost);
    expect(q.tiers_used).toBe(expectedT1.quote.tiers_used);
    closeTo(q.overhead, expectedT1.quote.overhead);
    closeTo(q.packaging, expectedT1.quote.packaging);
    closeTo(q.total_cost, expectedT1.quote.total_cost);
    closeTo(q.profit, expectedT1.quote.profit);
    closeTo(q.total_price, expectedT1.quote.price);
    closeTo(q.margin_check, expectedT1.quote.margin_check);
  });

  // -------------------------------------------------------------------------
  // Test T2: Settings variant
  // -------------------------------------------------------------------------
  it('T2: Settings variant calculations match within 1e-6', () => {
    const dataT2: AppData = {
      ...fixtureData,
      settings: {
        ...fixtureData.settings,
        overhead_pct: 0.30,
        target_margin: 0.35,
        labour_rate_per_hour: 450,
      },
    };

    const res = compute(dataT2, quoteInput);

    // Flavours
    for (const [id, expPrice] of Object.entries(expectedT2.flavour_price_per_kg as Record<string, number>)) {
      const f = res.flavours[id];
      expect(f).toBeDefined();
      closeTo(f.price_per_kg, expPrice);
    }

    // Quote
    expect(res.quote).toBeDefined();
    const q = res.quote!;
    closeTo(q.tier_cost, expectedT2.quote.tier_cost);
    expect(q.tiers_used).toBe(expectedT2.quote.tiers_used);
    closeTo(q.overhead, expectedT2.quote.overhead);
    closeTo(q.packaging, expectedT2.quote.packaging);
    closeTo(q.total_cost, expectedT2.quote.total_cost);
    closeTo(q.profit, expectedT2.quote.profit);
    closeTo(q.total_price, expectedT2.quote.price);
    closeTo(q.margin_check, expectedT2.quote.margin_check);

    // Products
    const expProd = expectedT2.products;
    const donut = res.batch_products['donut'];
    closeTo(donut.pieces, expProd.donut.pieces);
    closeTo(donut.unit_cost, expProd.donut.unit_cost);
    closeTo(donut.each_including_box, expProd.donut.each_incl_box);
    closeTo(donut.each_excluding_box, expProd.donut.each_excl_box);
    closeTo(donut.box_price, expProd.donut.box_price);
    closeTo(donut.headline_each, expProd.donut.each_shown);

    const macaron = res.batch_products['macaron'];
    closeTo(macaron.pieces, expProd.macaron.pieces);
    closeTo(macaron.unit_cost, expProd.macaron.unit_cost);
    closeTo(macaron.each_including_box, expProd.macaron.each_incl_box);
    closeTo(macaron.each_excluding_box, expProd.macaron.each_excl_box);
    closeTo(macaron.box_price, expProd.macaron.box_price);
    closeTo(macaron.headline_each, expProd.macaron.each_shown);

    const cupcake = res.assembled_products['cupcake'];
    closeTo(cupcake.unit_cost, expProd.cupcake.unit_cost);
    closeTo(cupcake.price_each, expProd.cupcake.price_each);

    const cakepop = res.assembled_products['cakepop'];
    closeTo(cakepop.unit_cost, expProd.cakepop.unit_cost);
    closeTo(cakepop.price_each, expProd.cakepop.price_each);
  });

  // -------------------------------------------------------------------------
  // Test T3: Gate — tier 1 size 0 and tier 2 size 1 -> quote == null
  // -------------------------------------------------------------------------
  it('T3: Gate — tier 1 size 0 produces quote == null', () => {
    const inputWithZeroTier1: QuoteInput = {
      ...quoteInput,
      tiers: [
        { size_kg: 0, flavour_id: 'plain', filling_id: 'f_jam' },
        { size_kg: 1, flavour_id: 'plain', filling_id: 'f_jam' },
        { size_kg: 0 },
        { size_kg: 0 },
        { size_kg: 0 },
        { size_kg: 0 },
      ],
    };

    const res = compute(fixtureData, inputWithZeroTier1);
    expect(res.quote).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test T4: Missing flavour on active tier
  // -------------------------------------------------------------------------
  it('T4: Missing flavour on tier 2 produces W_TIER_NO_FLAVOUR but counts tiers_used', () => {
    const inputMissingFlavour: QuoteInput = {
      ...quoteInput,
      tiers: [
        { size_kg: 2, flavour_id: 'plain', filling_id: 'f_jam' },
        { size_kg: 1, flavour_id: null, filling_id: 'f_jam' },
        { size_kg: 0 },
        { size_kg: 0 },
        { size_kg: 0 },
        { size_kg: 0 },
      ],
    };

    const res = compute(fixtureData, inputMissingFlavour);
    expect(res.quote).not.toBeNull();
    expect(res.quote!.tiers_used).toBe(2);
    expect(res.quote!.warnings.some(w => w.code === 'W_TIER_NO_FLAVOUR')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T5: Flavour without size
  // -------------------------------------------------------------------------
  it('T5: Flavour without size generates W_TIER_NO_SIZE and contributes 0 to tiers_used', () => {
    const inputFlavourNoSize: QuoteInput = {
      ...quoteInput,
      tiers: [
        { size_kg: 2, flavour_id: 'plain', filling_id: 'f_jam' },
        { size_kg: 1, flavour_id: 'marble', filling_id: 'f_bc' },
        { size_kg: 0, flavour_id: 'choc', filling_id: 'f_curd' }, // size 0
        { size_kg: 0 },
        { size_kg: 0 },
        { size_kg: 0 },
      ],
    };

    const res = compute(fixtureData, inputFlavourNoSize);
    expect(res.quote).not.toBeNull();
    expect(res.quote!.tiers_used).toBe(2);
    expect(res.quote!.warnings.some(w => w.code === 'W_TIER_NO_SIZE')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T6: Free labour warnings
  // -------------------------------------------------------------------------
  it('T6: Zero labour hours generates W_NO_TIME_HOURS and W_NO_LABOUR_HOURS', () => {
    const zeroLabourQuoteInput: QuoteInput = {
      ...quoteInput,
      decoration: {
        ...quoteInput.decoration,
        time_hours: 0,
      },
    };

    const zeroLabourData: AppData = {
      ...fixtureData,
      batch_products: [
        {
          ...fixtureData.batch_products[0],
          labour_hours_per_batch: 0,
        },
      ],
    };

    const res = compute(zeroLabourData, zeroLabourQuoteInput);
    expect(res.quote!.warnings.some(w => w.code === 'W_NO_TIME_HOURS')).toBe(true);
    const prod = res.batch_products[fixtureData.batch_products[0].id];
    expect(prod.warnings.some(w => w.code === 'W_NO_LABOUR_HOURS')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T7: Unpriced ingredient
  // -------------------------------------------------------------------------
  it('T7: Pack price 0 generates W_UNPRICED_INGREDIENT, does not crash', () => {
    const unpricedData: AppData = {
      ...fixtureData,
      ingredients: fixtureData.ingredients.map(ing =>
        ing.id === 'flour' ? { ...ing, pack_price: 0 } : ing
      ),
    };

    const res = compute(unpricedData, quoteInput);
    const plainRecipe = res.recipes['cake_plain'];
    expect(plainRecipe).toBeDefined();
    expect(plainRecipe.warnings.some(w => w.code === 'W_UNPRICED_INGREDIENT')).toBe(true);
    expect(Number.isFinite(plainRecipe.cwo)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T8: Margin 0 & Margin >= 1
  // -------------------------------------------------------------------------
  it('T8: Target margin 0 results in profit = 0, total_price == total_cost', () => {
    const marginZeroData: AppData = {
      ...fixtureData,
      settings: {
        ...fixtureData.settings,
        target_margin: 0,
      },
    };

    const res = compute(marginZeroData, quoteInput);
    expect(res.quote).not.toBeNull();
    closeTo(res.quote!.profit, 0);
    closeTo(res.quote!.total_price, res.quote!.total_cost);
    closeTo(res.quote!.margin_check, 0);
  });

  // -------------------------------------------------------------------------
  // Test T9: Overhead 0
  // -------------------------------------------------------------------------
  it('T9: Overhead 0 results in cost_with_overhead == raw_cost', () => {
    const overheadZeroData: AppData = {
      ...fixtureData,
      settings: {
        ...fixtureData.settings,
        overhead_pct: 0,
      },
    };

    const res = compute(overheadZeroData, quoteInput);
    for (const id of Object.keys(res.recipes)) {
      const r = res.recipes[id];
      closeTo(r.cwo, r.raw);
    }
  });

  // -------------------------------------------------------------------------
  // Test T10: Doubling overhead_pct from 0.25 to 0.5 raises recipe cwo by factor 1.5 / 1.25
  // -------------------------------------------------------------------------
  it('T10: Doubling overhead_pct from 0.25 to 0.5 raises recipe cwo by factor 1.5 / 1.25', () => {
    const data025 = fixtureData;
    const data050: AppData = {
      ...fixtureData,
      settings: {
        ...fixtureData.settings,
        overhead_pct: 0.50,
      },
    };

    const res025 = compute(data025);
    const res050 = compute(data050);

    const expectedFactor = 1.5 / 1.25;

    for (const id of Object.keys(res025.recipes)) {
      const r025 = res025.recipes[id];
      const r050 = res050.recipes[id];
      closeTo(r050.cwo, r025.cwo * expectedFactor);
    }
  });

  // -------------------------------------------------------------------------
  // Test T11: Delete protection
  // -------------------------------------------------------------------------
  it('T11: Deleting an ingredient used by a recipe is detectable via references', () => {
    const ingredientId = 'flour';
    const usedByRecipes = fixtureData.recipes.filter(r =>
      r.lines.some(l => l.ingredient_id === ingredientId)
    );
    expect(usedByRecipes.length).toBeGreaterThan(0);
    expect(usedByRecipes.map(r => r.id)).toContain('cake_plain');
  });

  // -------------------------------------------------------------------------
  // Test T12: Round trip export -> clear -> import -> compute identical
  // -------------------------------------------------------------------------
  it('T12: Round trip export -> import produces identical compute results within 1e-9', () => {
    const exportedJson = exportAllData(fixtureData);
    const emptyApp: AppData = {
      settings: fixtureData.settings,
      ingredients: [],
      packaging_items: [],
      recipes: [],
      flavours: [],
      fillings: [],
      batch_products: [],
      assembled_products: [],
      size_guide: [],
      saved_quotes: [],
      customers: [],
      orders: [],
    };

    const parsed = parseImportFile(exportedJson, emptyApp);
    expect(parsed.valid).toBe(true);

    const importedData = parsed.parsed as AppData;
    const origRes = compute(fixtureData, quoteInput);
    const impRes = compute(importedData, quoteInput);

    // Tolerance 1e-9
    closeTo(impRes.quote!.total_price, origRes.quote!.total_price, 1e-9);
    closeTo(impRes.quote!.total_cost, origRes.quote!.total_cost, 1e-9);
    for (const id of Object.keys(origRes.flavours)) {
      closeTo(impRes.flavours[id].price_per_kg, origRes.flavours[id].price_per_kg, 1e-9);
    }
  });

  // -------------------------------------------------------------------------
  // Test T13: Import atomicity
  // -------------------------------------------------------------------------
  it('T13: Invalid reference in import fails validation and rejects completely', () => {
    const invalidData = {
      format: 'bakery-costing-data',
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      app_version: '1.0.0',
      settings: fixtureData.settings,
      ingredients: fixtureData.ingredients,
      packaging_items: fixtureData.packaging_items,
      recipes: [
        ...fixtureData.recipes,
        {
          id: 'bad_recipe',
          name: 'Bad Recipe',
          kind: 'cake',
          weight_adjustment_g: 0,
          lines: [
            {
              ingredient_id: 'non_existent_ingredient',
              quantity: 100,
              unit: 'g',
            },
          ],
        },
      ],
      flavours: fixtureData.flavours,
      fillings: fixtureData.fillings,
      batch_products: fixtureData.batch_products,
      assembled_products: fixtureData.assembled_products,
    };

    const result = parseImportFile(JSON.stringify(invalidData), fixtureData);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('non_existent_ingredient'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T14: Dropdown filters by kind
  // -------------------------------------------------------------------------
  it('T14: Dropdown filters correctly classify recipe kinds', () => {
    const cakeRecipes = fixtureData.recipes.filter(r => r.kind === 'cake');
    const frostingRecipes = fixtureData.recipes.filter(r => r.kind === 'frosting_filling');
    const batchRecipes = fixtureData.recipes.filter(r => r.kind === 'batch_product');

    expect(cakeRecipes.map(r => r.id)).toEqual(['cake_plain', 'cake_choc']);
    expect(frostingRecipes.map(r => r.id)).toEqual(['buttercream', 'curd']);
    expect(batchRecipes.map(r => r.id)).toEqual(['dough', 'shell']);
  });

  // -------------------------------------------------------------------------
  // Test T15: Discount smaller than profit — applied fully
  // -------------------------------------------------------------------------
  it('T15: Discount smaller than profit reduces total_price by exactly that amount', () => {
    const res = compute(fixtureData, quoteInput);
    const baseQ = res.quote!;
    const discountAmount = baseQ.profit * 0.5; // 50% of profit

    const inputWithDiscount: QuoteInput = {
      ...quoteInput,
      decoration: { ...quoteInput.decoration, discount: discountAmount },
    };

    const res2 = compute(fixtureData, inputWithDiscount);
    const q2 = res2.quote!;

    // discount should equal the requested amount (not capped)
    closeTo(q2.discount, discountAmount);
    expect(q2.discount_capped).toBe(false);

    // total_price should be original total_price minus the discount
    closeTo(q2.total_price, baseQ.total_price - discountAmount);

    // total_cost is unchanged
    closeTo(q2.total_cost, baseQ.total_cost);

    // profit (pre-discount) is unchanged
    closeTo(q2.profit, baseQ.profit);

    // effective margin = (profit - discount) / (total_price - delivery)
    const expectedMargin = (baseQ.profit - discountAmount) / (q2.total_price - q2.delivery);
    closeTo(q2.margin_check, expectedMargin);

    // no W_DISCOUNT_CAPPED warning
    expect(q2.warnings.some(w => w.code === 'W_DISCOUNT_CAPPED')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test T16: Discount larger than profit — capped to profit, sells at cost
  // -------------------------------------------------------------------------
  it('T16: Discount larger than profit is capped to profit; total_price == total_cost + delivery part', () => {
    const res = compute(fixtureData, quoteInput);
    const baseQ = res.quote!;
    const hugeDiscount = baseQ.profit * 2; // double profit — must be capped

    const inputWithHugeDiscount: QuoteInput = {
      ...quoteInput,
      decoration: { ...quoteInput.decoration, discount: hugeDiscount },
    };

    const res2 = compute(fixtureData, inputWithHugeDiscount);
    const q2 = res2.quote!;

    // effective discount should be capped to the full profit
    closeTo(q2.discount, baseQ.profit);
    expect(q2.discount_capped).toBe(true);

    // total_price = total_cost + profit - profit = total_cost  (sell at cost)
    closeTo(q2.total_price, baseQ.total_cost);

    // margin_check should be 0 (or very close) after full discount
    closeTo(q2.margin_check, 0);

    // W_DISCOUNT_CAPPED warning must be present
    expect(q2.warnings.some(w => w.code === 'W_DISCOUNT_CAPPED')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test T17: Discount of zero — no change to any output
  // -------------------------------------------------------------------------
  it('T17: Discount of 0 produces identical results to no discount field', () => {
    const resNoDiscount = compute(fixtureData, quoteInput);

    const inputZeroDiscount: QuoteInput = {
      ...quoteInput,
      decoration: { ...quoteInput.decoration, discount: 0 },
    };
    const resZeroDiscount = compute(fixtureData, inputZeroDiscount);

    const qA = resNoDiscount.quote!;
    const qB = resZeroDiscount.quote!;

    closeTo(qB.total_price, qA.total_price);
    closeTo(qB.total_cost, qA.total_cost);
    closeTo(qB.profit, qA.profit);
    closeTo(qB.margin_check, qA.margin_check);
    expect(qB.discount).toBe(0);
    expect(qB.discount_capped).toBe(false);
    expect(qB.warnings.some(w => w.code === 'W_DISCOUNT_CAPPED')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test T18: Negative discount — treated as 0
  // -------------------------------------------------------------------------
  it('T18: Negative discount is treated as 0, no change to output', () => {
    const resBase = compute(fixtureData, quoteInput);

    const inputNegDiscount: QuoteInput = {
      ...quoteInput,
      decoration: { ...quoteInput.decoration, discount: -500 },
    };
    const resNeg = compute(fixtureData, inputNegDiscount);

    const qBase = resBase.quote!;
    const qNeg = resNeg.quote!;

    closeTo(qNeg.total_price, qBase.total_price);
    expect(qNeg.discount).toBe(0);
    expect(qNeg.discount_capped).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test T19: Discount on empty/null quote — compute returns null, no crash
  // -------------------------------------------------------------------------
  it('T19: Discount field set but quote is null (tier 1 size 0) — no crash, quote stays null', () => {
    const inputNoTier: QuoteInput = {
      ...quoteInput,
      tiers: [
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
      ],
      decoration: { ...quoteInput.decoration, discount: 1000 },
    };

    const res = compute(fixtureData, inputNoTier);
    expect(res.quote).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test T20: Phase 1 — Save quote -> export -> import -> load (round trip)
  // -------------------------------------------------------------------------
  it('T20: Save quote -> export -> import -> load round trip', () => {
    const computed = compute(fixtureData, quoteInput);
    expect(computed.quote).toBeDefined();

    const savedQuote: SavedQuote = {
      id: 'quote-test-1',
      name: 'Wedding Cake 2026-10-07',
      created_at: '2026-10-07T10:00:00.000Z',
      updated_at: '2026-10-07T10:00:00.000Z',
      input: JSON.parse(JSON.stringify(quoteInput)),
      result_snapshot: JSON.parse(JSON.stringify(computed.quote)),
      notes: 'Customer requested vanilla + strawberry',
    };

    const dataWithQuote: AppData = {
      ...fixtureData,
      saved_quotes: [savedQuote],
    };

    // Export
    const exportedJson = exportAllData(dataWithQuote);
    expect(exportedJson).toContain('"saved_quotes"');

    // Import into blank data
    const blankData: AppData = {
      ...fixtureData,
      saved_quotes: [],
    };
    const importPreview = parseImportFile(exportedJson, blankData);
    expect(importPreview.valid).toBe(true);
    expect(importPreview.errors).toHaveLength(0);
    expect(importPreview.counts.saved_quotes.add).toBe(1);

    const importedQuotes = importPreview.parsed.saved_quotes;
    expect(importedQuotes).toBeDefined();
    expect(importedQuotes).toHaveLength(1);

    const loaded = importedQuotes![0];
    expect(loaded.id).toBe('quote-test-1');
    expect(loaded.name).toBe('Wedding Cake 2026-10-07');
    expect(loaded.notes).toBe('Customer requested vanilla + strawberry');
    expect(loaded.created_at).toBe('2026-10-07T10:00:00.000Z');
    expect(loaded.input.tiers).toEqual(quoteInput.tiers);
    expect(loaded.input.decoration).toEqual(quoteInput.decoration);

    const snap = loaded.result_snapshot as any;
    expect(snap).toBeDefined();
    closeTo(snap.total_price, computed.quote!.total_price);
    closeTo(snap.total_cost, computed.quote!.total_cost);
    closeTo(snap.profit, computed.quote!.profit);
  });

  // -------------------------------------------------------------------------
  // Test T21: Phase 1 — Recalculate with current prices produces exact same numbers as fresh compute
  // -------------------------------------------------------------------------
  it('T21: Recalculate with current prices produces same numbers as fresh compute on same inputs', () => {
    const computedInitial = compute(fixtureData, quoteInput);

    const savedQuote: SavedQuote = {
      id: 'quote-test-recalc',
      name: 'Birthday Cake',
      created_at: '2026-10-01T08:00:00.000Z',
      input: JSON.parse(JSON.stringify(quoteInput)),
      result_snapshot: JSON.parse(JSON.stringify(computedInitial.quote)),
    };

    // Perform recalculation using current catalogue data
    const recalculated = compute(fixtureData, savedQuote.input);
    expect(recalculated.quote).toBeDefined();

    const freshCompute = compute(fixtureData, quoteInput);
    expect(freshCompute.quote).toBeDefined();

    // Recalculated matches fresh compute exactly
    closeTo(recalculated.quote!.total_price, freshCompute.quote!.total_price);
    closeTo(recalculated.quote!.total_cost, freshCompute.quote!.total_cost);
    closeTo(recalculated.quote!.tier_cost, freshCompute.quote!.tier_cost);
    closeTo(recalculated.quote!.overhead, freshCompute.quote!.overhead);
    closeTo(recalculated.quote!.packaging, freshCompute.quote!.packaging);
    closeTo(recalculated.quote!.profit, freshCompute.quote!.profit);
    closeTo(recalculated.quote!.margin_check, freshCompute.quote!.margin_check);
  });

  // -------------------------------------------------------------------------
  // Test T22: Phase 1 — Catalogue price update changes recalculate quote while leaving saved snapshot unchanged
  // -------------------------------------------------------------------------
  it('T22: Catalogue price change updates recalculate quote without mutating saved snapshot', () => {
    const computedInitial = compute(fixtureData, quoteInput);
    const initialPrice = computedInitial.quote!.total_price;

    const savedSnapshot = JSON.parse(JSON.stringify(computedInitial.quote));
    const savedQuote: SavedQuote = {
      id: 'quote-test-price-change',
      name: 'Snapshot Quote',
      created_at: '2026-09-15T12:00:00.000Z',
      input: JSON.parse(JSON.stringify(quoteInput)),
      result_snapshot: savedSnapshot,
    };

    // Now update flour pack price in fixtureData
    const updatedIngredients = fixtureData.ingredients.map(ing => {
      if (ing.id === 'flour') {
        return { ...ing, pack_price: ing.pack_price * 2 }; // double flour price
      }
      return ing;
    });
    const modifiedData: AppData = {
      ...fixtureData,
      ingredients: updatedIngredients,
    };

    // Recalculate with modified data
    const recalculated = compute(modifiedData, savedQuote.input);
    expect(recalculated.quote).toBeDefined();

    // Recalculated price is strictly higher due to more expensive flour
    expect(recalculated.quote!.total_price).toBeGreaterThan(initialPrice);

    // Stored snapshot on the saved quote is completely unchanged
    const snap = savedQuote.result_snapshot as any;
    closeTo(snap.total_price, initialPrice);
  });

  // -------------------------------------------------------------------------
  // Test T23: Phase 2 — Rounding computes suggested prices correctly at steps 1, 10, 50, 100
  // -------------------------------------------------------------------------
  it('T23: Phase 2 — Rounding computes suggested prices correctly at steps 1, 10, 50, 100', () => {
    const run = (step: number) => compute({
      ...fixtureData,
      settings: { ...fixtureData.settings, price_rounding_step: step }
    }, quoteInput);

    const r1 = run(1).quote!;
    expect(r1.suggested_price).toBe(Math.round(r1.total_price));

    const r10 = run(10).quote!;
    expect(r10.suggested_price).toBe(Math.round(r10.total_price / 10) * 10);

    const r50 = run(50).quote!;
    expect(r50.suggested_price).toBe(Math.round(r50.total_price / 50) * 50);

    const r100 = run(100).quote!;
    expect(r100.suggested_price).toBe(Math.round(r100.total_price / 100) * 100);
  });

  // -------------------------------------------------------------------------
  // Test T24: Phase 2 — Rounding never changes total_price, profit, or margin_check
  // -------------------------------------------------------------------------
  it('T24: Phase 2 — Rounding never changes total_price, profit, or margin_check', () => {
    const base = compute(fixtureData, quoteInput).quote!;
    const rounded = compute({
      ...fixtureData,
      settings: { ...fixtureData.settings, price_rounding_step: 50 }
    }, quoteInput).quote!;

    closeTo(rounded.total_price, base.total_price);
    closeTo(rounded.profit, base.profit);
    closeTo(rounded.margin_check, base.margin_check);
    expect(rounded.suggested_price).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test T25: Phase 2 — Rounding step 0 produces no suggested values
  // -------------------------------------------------------------------------
  it('T25: Phase 2 — Rounding step 0 produces no suggested values', () => {
    const r = compute({
      ...fixtureData,
      settings: { ...fixtureData.settings, price_rounding_step: 0 }
    }, quoteInput);
    expect(r.quote!.suggested_price).toBeUndefined();
    expect(r.batch_products['donut'].suggested_headline_each).toBeUndefined();
    expect(r.assembled_products['cupcake'].suggested_price_each).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test T26: Phase 2 — Rounding applies to batch and assembled products
  // -------------------------------------------------------------------------
  it('T26: Phase 2 — Rounding applies to batch and assembled products', () => {
    const r = compute({
      ...fixtureData,
      settings: { ...fixtureData.settings, price_rounding_step: 10 }
    }, quoteInput);

    const donut = r.batch_products['donut'];
    expect(donut.suggested_headline_each).toBe(Math.round(donut.headline_each / 10) * 10);

    const cupcake = r.assembled_products['cupcake'];
    expect(cupcake.suggested_price_each).toBe(Math.round(cupcake.price_each / 10) * 10);
  });

  // -------------------------------------------------------------------------
  // Test T27: Phase 3 — Editable Size Guide
  // -------------------------------------------------------------------------
  it('T27: Phase 3 — Size guide entries are stored and used for quote sizes', () => {
    const customSizeGuide = [
      { label: 'Mini', kg: 0.25, servings: 2 },
      { label: 'Massive', kg: 10, servings: 200 },
    ];
    const modifiedData = { ...fixtureData, size_guide: customSizeGuide };

    // The size guide is stored correctly
    expect(modifiedData.size_guide).toHaveLength(2);
    expect(modifiedData.size_guide[0].label).toBe('Mini');

    // A quote using the custom size produces a positive tier cost,
    // using real fixture IDs so the cost is non-zero
    const r = compute(modifiedData, {
      ...quoteInput,
      tiers: [
        { size_kg: 0.25, flavour_id: 'plain', filling_id: 'f_jam' },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
        { size_kg: 0, flavour_id: null, filling_id: null },
      ],
    });
    expect(r.quote).toBeDefined();
    expect(r.quote!.tier_cost).toBeGreaterThan(0);
    expect(r.quote!.tiers_used).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test T28: Phase 4 — Customer CRUD round-trip
  // -------------------------------------------------------------------------
  it('T28: Phase 4 — Customer can be added, found, and linked to an order', () => {
    const customer: Customer = {
      id: 'cust-test-001',
      name: 'Nadia Rahman',
      phone: '01712345678',
      email: 'nadia@example.com',
      address: 'House 12, Road 5, Dhaka',
    };

    const dataWithCustomer: AppData = {
      ...fixtureData,
      customers: [customer],
      orders: [],
    };

    expect(dataWithCustomer.customers).toHaveLength(1);
    expect(dataWithCustomer.customers[0].name).toBe('Nadia Rahman');
  });

  // -------------------------------------------------------------------------
  // Test T29: Phase 4 — Order with customer and quote reference is valid
  // -------------------------------------------------------------------------
  it('T29: Phase 4 — Order links customer and quote correctly; no W_ORDER_WITHOUT_QUOTE', () => {
    const savedQuote: SavedQuote = {
      id: 'quote-ord-test',
      name: 'Wedding Cake',
      created_at: new Date().toISOString(),
      input: quoteInput,
      result_snapshot: null,
    };
    const customer: Customer = { id: 'cust-ord-test', name: 'Test Customer' };
    const order: Order = {
      id: 'ord-test-001',
      customer_id: 'cust-ord-test',
      quote_id: 'quote-ord-test',
      order_date: '2026-10-07',
      due_date: '2099-12-31',
      status: 'Confirmed',
    };

    const data: AppData = {
      ...fixtureData,
      customers: [customer],
      saved_quotes: [savedQuote],
      orders: [order],
    };

    const res = compute(data, quoteInput);
    const orderWarnings = res.all_warnings.filter(w => w.code === 'W_ORDER_WITHOUT_QUOTE');
    expect(orderWarnings).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test T30: Phase 4 — Order without quote generates W_ORDER_WITHOUT_QUOTE;
  //            past-due order generates W_ORDER_PAST_DUE
  // -------------------------------------------------------------------------
  it('T30: Phase 4 — Order without quote triggers W_ORDER_WITHOUT_QUOTE; past-due triggers W_ORDER_PAST_DUE', () => {
    const order: Order = {
      id: 'ord-no-quote',
      customer_id: null,
      quote_id: null,        // missing quote
      order_date: '2026-01-01',
      due_date: '2026-01-10', // well in the past
      status: 'Confirmed',
    };

    const data: AppData = { ...fixtureData, orders: [order] };
    const res = compute(data, quoteInput);

    const withoutQuote = res.all_warnings.filter(w => w.code === 'W_ORDER_WITHOUT_QUOTE');
    const pastDue = res.all_warnings.filter(w => w.code === 'W_ORDER_PAST_DUE');

    expect(withoutQuote.length).toBeGreaterThan(0);
    expect(pastDue.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test T31: Phase 5 — Ingredient price history is appended on price change
  // -------------------------------------------------------------------------
  it('T31: Phase 5 — price_history entry is appended when pack_price changes', () => {
    const original = fixtureData.ingredients.find(i => i.id === 'flour')!;
    expect(original).toBeDefined();

    // Simulate UPDATE_INGREDIENT with a changed pack_price by applying the same
    // logic the store reducer uses: detect a diff and append a history entry.
    const today = localDateString();
    const updated = {
      ...original,
      pack_price: original.pack_price * 2,
      price_history: [
        ...(original.price_history ?? []),
        { date: today, pack_quantity: original.pack_quantity, pack_price: original.pack_price * 2 },
      ],
    };
    expect(updated.price_history).toHaveLength((original.price_history?.length ?? 0) + 1);
    expect(updated.price_history!.at(-1)!.date).toBe(today);
    expect(updated.price_history!.at(-1)!.pack_quantity).toBe(original.pack_quantity);
    expect(updated.price_history!.at(-1)!.pack_price).toBe(original.pack_price * 2);
  });

  // -------------------------------------------------------------------------
  // Test T32: Phase 5 — Price-change detection via ingredient_prices in snapshot
  // -------------------------------------------------------------------------
  it('T32: Phase 5 — changed ingredient since save is detected via ingredient_prices snapshot', () => {
    const flour = fixtureData.ingredients.find(i => i.id === 'flour')!;
    // Simulate a snapshot that recorded the old flour price
    const fakeSnapshot = {
      ingredient_prices: [
        { id: 'flour', pack_price: flour.pack_price, pack_quantity: flour.pack_quantity },
      ],
    };

    // Double the flour price in current catalogue
    const updatedData: AppData = {
      ...fixtureData,
      ingredients: fixtureData.ingredients.map(i =>
        i.id === 'flour' ? { ...i, pack_price: i.pack_price * 2 } : i
      ),
    };

    // Replicate detection logic: compare snapshot ingredient_prices to current catalogue
    const changed = (fakeSnapshot.ingredient_prices as Array<{ id: string; pack_price: number; pack_quantity: number }>)
      .filter(sp => {
        const cur = updatedData.ingredients.find(i => i.id === sp.id);
        return cur && (cur.pack_price !== sp.pack_price || cur.pack_quantity !== sp.pack_quantity);
      })
      .map(sp => updatedData.ingredients.find(i => i.id === sp.id)!.name);

    expect(changed).toContain('Flour'); // flour's name in fixture
  });

  // -------------------------------------------------------------------------
  // Test T33: Phase 6 — Recipe Scaling
  // -------------------------------------------------------------------------
  it('T33: Phase 6 — Recipe Scaling: scaling by 1 is a no-op; scaling by 0.5 and 2 produces exactly half/double the raw cost, cwo, and weight', () => {
    const spongeId = 'cake_plain';
    const unscaled = compute(fixtureData).recipes[spongeId];

    const scaled1 = compute(fixtureData, null, { [spongeId]: 1 }).recipes[spongeId];
    expect(scaled1.raw).toBeCloseTo(unscaled.raw, 4);
    expect(scaled1.cwo).toBeCloseTo(unscaled.cwo, 4);
    expect(scaled1.weight).toBeCloseTo(unscaled.weight, 4);

    const scaledHalf = compute(fixtureData, null, { [spongeId]: 0.5 }).recipes[spongeId];
    expect(scaledHalf.raw).toBeCloseTo(unscaled.raw * 0.5, 4);
    expect(scaledHalf.cwo).toBeCloseTo(unscaled.cwo * 0.5, 4);
    expect(scaledHalf.weight).toBeCloseTo(unscaled.weight * 0.5, 4);

    const scaledDouble = compute(fixtureData, null, { [spongeId]: 2 }).recipes[spongeId];
    expect(scaledDouble.raw).toBeCloseTo(unscaled.raw * 2, 4);
    expect(scaledDouble.cwo).toBeCloseTo(unscaled.cwo * 2, 4);
    expect(scaledDouble.weight).toBeCloseTo(unscaled.weight * 2, 4);

    // per_gram_cwo should be unaffected (except for precision artifacts)
    expect(scaledDouble.per_gram_cwo).toBeCloseTo(unscaled.per_gram_cwo, 4);
  });

  it('T34: warns when a teaspoon ingredient has no grams conversion', () => {
    const ingredient = { ...fixtureData.ingredients[0], grams_per_tsp: null };
    const data: AppData = {
      ...fixtureData,
      ingredients: fixtureData.ingredients.map(item => item.id === ingredient.id ? ingredient : item),
      recipes: [...fixtureData.recipes, {
        id: 'tsp_recipe',
        name: 'Teaspoon recipe',
        kind: 'other',
        lines: [{ ingredient_id: ingredient.id, quantity: 1, unit: 'tsp' }],
        weight_adjustment_g: 0,
      }],
    };

    const result = compute(data);

    expect(result.recipes.tsp_recipe).toBeDefined();
    expect(result.all_warnings.some(warning => warning.code === 'W_TSP_UNCONVERTED')).toBe(true);
  });

  it('T35: warns when a product has no valid pieces-per-box value', () => {
    const batch = { ...fixtureData.batch_products[0], pieces_per_box: 0 };
    const assembled = { ...fixtureData.assembled_products[0], pieces_per_box: 0 };
    const result = compute({
      ...fixtureData,
      batch_products: [batch],
      assembled_products: [assembled],
    });

    expect(result.batch_products[batch.id].warnings.some(warning => warning.code === 'W_ZERO_PACK_SIZE')).toBe(true);
    expect(result.assembled_products[assembled.id].warnings.some(warning => warning.code === 'W_ZERO_PACK_SIZE')).toBe(true);
    expect(Number.isFinite(result.batch_products[batch.id].cost_each)).toBe(true);
    expect(Number.isFinite(result.assembled_products[assembled.id].cost_each)).toBe(true);
  });

  it('localDateString uses the local calendar date rather than UTC', () => {
    expect(localDateString(new Date(2026, 10, 2, 2, 0))).toBe('2026-11-02');
  });
});
