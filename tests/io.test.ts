import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type AppData, type Recipe } from '../src/engine/types';
import { exportAllData, importIngredientsCSV, parseImportFile } from '../src/io/io';

describe('Recipe labour hours import and export', () => {
  it('preserves recipe labour_hours through a full JSON export and import', () => {
    const recipe: Recipe = {
      id: 'recipe-labour',
      name: 'Test recipe',
      kind: 'cake',
      lines: [],
      weight_adjustment_g: 0,
      labour_hours: 0.5,
    };
    const data = { ...EMPTY_APP_DATA, recipes: [recipe] };

    const exported = JSON.parse(exportAllData(data)) as {
      schema_version: string;
      app_version: string;
      recipes: Array<{ labour_hours?: number }>;
    };
    expect(exported.schema_version).toBe('1.6');
    expect(exported.app_version).toBe('1.6.6');
    expect(exported.recipes[0].labour_hours).toBe(0.5);

    const preview = parseImportFile(JSON.stringify(exported), EMPTY_APP_DATA);
    expect(preview.valid).toBe(true);
    expect(preview.parsed.recipes?.[0].labour_hours).toBe(0.5);
  });

  it('accepts older recipes without labour_hours and ignores invalid values', () => {
    const content = JSON.stringify({
      format: 'bakery-costing-data',
      schema_version: '1.2',
      recipes: [
        { id: 'legacy', name: 'Legacy recipe', kind: 'cake', lines: [], weight_adjustment_g: 0 },
        { id: 'negative', name: 'Negative labour', kind: 'cake', lines: [], weight_adjustment_g: 0, labour_hours: -0.5 },
        { id: 'string', name: 'String labour', kind: 'cake', lines: [], weight_adjustment_g: 0, labour_hours: '0.5' },
      ],
    });

    const preview = parseImportFile(content, EMPTY_APP_DATA);
    expect(preview.valid).toBe(true);
    expect(preview.parsed.recipes?.map(recipe => recipe.labour_hours)).toEqual([undefined, undefined, undefined]);
  });
});

describe('Partial ingredient imports', () => {
  const flour = {
    id: 'flour',
    name: 'Flour',
    unit_type: 'g' as const,
    pack_quantity: 1000,
    pack_price: 100,
    piece_weight_g: null,
    grams_per_tsp: null,
  };
  const data = { ...EMPTY_APP_DATA, ingredients: [flour] };
  const content = (ingredient: Record<string, unknown>) => JSON.stringify({
    format: 'bakery-costing-data',
    schema_version: '1.6',
    ingredients: [ingredient],
  });

  describe('Ingredient CSV numeric validation', () => {
    it('rejects invalid prices without changing the existing ingredient', () => {
      const flour = {
        id: 'flour',
        name: 'Flour',
        unit_type: 'g' as const,
        pack_quantity: 1000,
        pack_price: 120,
      };
      const csv = [
        'id,name,unit_type,pack_quantity,pack_price,piece_weight_g,grams_per_tsp,notes',
        'flour,Flour,g,1000,abc,,,',
        'flour,Flour,g,1000,-50,,,',
      ].join('\n');

      const result = importIngredientsCSV(csv, [flour]);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Row 2: pack_price');
      expect(result.errors[1]).toContain('Row 3: pack_price');
      expect(result.items).toEqual([flour]);
    });
  });

  it('rejects partial records in strict mode and accepts them in merge mode', () => {
    const patch = {
      id: 'flour',
      nutrition_per_100g: { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76 },
      allergens: ['gluten'],
    };

    const strict = parseImportFile(content(patch), data, { allowPartialIngredients: false });
    expect(strict.valid).toBe(false);
    expect(strict.errors.some(error => error.path === 'ingredients[0].unit_type' && error.message === 'Must be "g" or "piece"')).toBe(true);

    const merged = parseImportFile(content(patch), data, { allowPartialIngredients: true });
    expect(merged.valid).toBe(true);
    expect(merged.partialIngredients).toBe(1);
    expect(merged.counts.ingredients).toEqual({ add: 0, update: 1, unchanged: 0 });
    expect(merged.parsed.ingredients?.[0]).toMatchObject({
      id: 'flour',
      name: 'Flour',
      unit_type: 'g',
      nutrition_per_100g: { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76 },
      allergens: ['gluten'],
    });
  });

  it('validates required fields supplied in a partial record', () => {
    const invalidUnit = parseImportFile(content({ id: 'flour', unit_type: 'invalid' }), data, { allowPartialIngredients: true });
    expect(invalidUnit.valid).toBe(false);
    expect(invalidUnit.errors).toContainEqual({
      path: 'ingredients[0].unit_type',
      message: 'Must be "g" or "piece"',
    });

    const validUnit = parseImportFile(content({ id: 'flour', unit_type: 'g' }), data, { allowPartialIngredients: true });
    expect(validUnit.valid).toBe(true);
    expect(validUnit.parsed.ingredients?.[0]).toMatchObject({ name: 'Flour', unit_type: 'g' });
  });

  it('preserves existing optional fields omitted from the partial patch', () => {
    const dataWithOptionalFields: AppData = {
      ...data,
      ingredients: [{ ...flour, notes: 'Keep this note', allergens: ['dairy'] }],
    };
    const preview = parseImportFile(content({
      id: 'flour',
      nutrition_per_100g: { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76 },
    }), dataWithOptionalFields, { allowPartialIngredients: true });

    expect(preview.valid).toBe(true);
    expect(preview.parsed.ingredients?.[0]).toMatchObject({
      name: 'Flour',
      notes: 'Keep this note',
      allergens: ['dairy'],
    });
  });
});
