import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compute } from '../../src/engine/engine';
import { computeAllergens, computeNutrition } from '../../src/engine/nutrition';
import type { AppData } from '../../src/engine/types';

const exportPath = process.env.BAKERY_EXPORT_PATH;

describe('F9 Data Health warnings in supplied real export', () => {
  it.skipIf(!exportPath)('reports every warning shown by Data Health for the export', () => {
    const data = JSON.parse(readFileSync(exportPath!, 'utf8')) as AppData;
    const additional = [];
    for (const recipe of data.recipes) {
      additional.push(
        ...computeNutrition(data, recipe.id).warnings,
        ...computeAllergens(data, recipe.id).warnings,
      );
    }

    const productLines = [
      ...data.batch_products.map(product => ({ product_kind: 'batch' as const, product_id: product.id, quantity: 1, unit: 'piece' as const })),
      ...data.assembled_products.map(product => ({ product_kind: 'assembled' as const, product_id: product.id, quantity: 1, unit: 'piece' as const })),
    ];
    if (productLines.length > 0) {
      additional.push(...computeAllergens(data, {
        id: 'data-health-products',
        name: 'Data Health products',
        created_at: '',
        kind: 'products',
        input: { tiers: [], decoration: { fondant_kg: 0, prints: 0, flowers: 0, toppers: 0, time_hours: 0, others: 0, delivery: 0 } },
        product_quote_input: { lines: productLines, delivery: 0 },
        result_snapshot: null,
      }).warnings);
    }

    const uniqueAdditional = new Map(additional.map(warning => [`${warning.code}:${warning.path ?? warning.context}`, warning]));
    const warnings = [...compute(data).all_warnings, ...uniqueAdditional.values()];
    process.stdout.write(`F9 Data Health warnings (${warnings.length}):\n`);
    for (const warning of warnings) {
      process.stdout.write(`${warning.code} | ${warning.path ?? '(no path)'} | ${warning.context}\n`);
    }
    expect(Array.isArray(warnings)).toBe(true);
  });
});
