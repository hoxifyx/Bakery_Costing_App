import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA, type Recipe } from '../src/engine/types';
import { exportAllData, parseImportFile } from '../src/io/io';

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
    expect(exported.schema_version).toBe('1.4');
    expect(exported.app_version).toBe('1.5.0');
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
