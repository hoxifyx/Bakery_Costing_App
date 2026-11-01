import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EMPTY_APP_DATA, type AppData } from '../src/engine/types';
import { CURRENT_SCHEMA_VERSION, exportAllData, parseImportFile } from '../src/io/io';

const fixturePath = path.resolve(__dirname, '../golden_test_fixture.json');
const fixtureData: AppData = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).fixture;

function importContent(ingredients: unknown[]): string {
  return JSON.stringify({
    format: 'bakery-costing-data',
    schema_version: '1.6',
    ingredients,
  });
}

const nutrition = { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76 };

describe('Merge-mode partial ingredient imports', () => {
  it('returns the strict merged candidate and counts a partial as an update', () => {
    const preview = parseImportFile(importContent([
      { id: 'flour', nutrition_per_100g: nutrition, allergens: ['gluten'] },
    ]), fixtureData, { allowPartialIngredients: true });

    expect(preview.errors).toEqual([]);
    expect(preview.valid).toBe(true);
    expect(preview.partialIngredients).toBe(1);
    expect(preview.counts.ingredients).toEqual({ add: 0, update: 1, unchanged: 0 });
    expect(preview.parsed.ingredients?.[0]).toMatchObject({
      id: 'flour',
      name: 'Flour',
      nutrition_per_100g: nutrition,
      allergens: ['gluten'],
    });
  });

  it('rejects a partial ingredient whose ID is not in the current data', () => {
    const preview = parseImportFile(importContent([
      { id: 'unknown', nutrition_per_100g: nutrition },
    ]), fixtureData, { allowPartialIngredients: true });

    expect(preview.valid).toBe(false);
    expect(preview.errors).toContainEqual({
      path: 'ingredients[0].id',
      message: "Partial ingredient 'unknown' cannot be added — merge into an existing record or supply all required fields.",
    });
    expect(preview.counts.ingredients.add).toBe(0);
    expect(preview.partialIngredients).toBe(0);
  });

  it('keeps full ingredient records valid in merge mode', () => {
    const fullRecord = {
      id: 'flour',
      name: 'Flour',
      unit_type: 'g',
      pack_quantity: 1000,
      pack_price: 100,
    };

    const mergePreview = parseImportFile(importContent([fullRecord]), fixtureData, { allowPartialIngredients: true });
    expect(mergePreview.valid).toBe(true);
    expect(mergePreview.partialIngredients).toBe(0);
    expect(mergePreview.parsed.ingredients?.[0]).toMatchObject(fullRecord);
  });

  it('keeps full ingredient records valid in strict replace mode', () => {
    const fullRecord = {
      id: 'flour',
      name: 'Flour',
      unit_type: 'g',
      pack_quantity: 1000,
      pack_price: 100,
    };
    const replacePreview = parseImportFile(importContent([fullRecord]), EMPTY_APP_DATA, { allowPartialIngredients: false });
    expect(replacePreview.valid).toBe(true);
    expect(replacePreview.partialIngredients).toBe(0);
    expect(replacePreview.parsed.ingredients?.[0]).toMatchObject(fullRecord);
  });

  it('rejects a mixed batch atomically when one partial ingredient is orphaned', () => {
    const validPatches = fixtureData.ingredients.slice(0, 5).map(ingredient => ({
      id: ingredient.id,
      nutrition_per_100g: nutrition,
    }));
    const preview = parseImportFile(importContent([
      ...validPatches,
      { id: 'missing-ingredient', nutrition_per_100g: nutrition },
    ]), fixtureData, { allowPartialIngredients: true });

    expect(preview.valid).toBe(false);
    expect(preview.partialIngredients).toBe(5);
    expect(preview.counts.ingredients).toEqual({ add: 0, update: 5, unchanged: 0 });
    expect(preview.errors.some(error => error.message.includes("Partial ingredient 'missing-ingredient' cannot be added"))).toBe(true);

    const applicableIngredients = preview.valid ? preview.parsed.ingredients : null;
    expect(applicableIngredients).toBeNull();
  });

  it('preserves schema version 1.6 in full exports', () => {
    const exported = JSON.parse(exportAllData(fixtureData)) as { schema_version: string };
    expect(CURRENT_SCHEMA_VERSION).toBe('1.6');
    expect(exported.schema_version).toBe('1.6');
  });
});
