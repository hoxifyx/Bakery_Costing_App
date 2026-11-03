import { describe, expect, it } from 'vitest';

describe('R4 product pricing override percentage entry', () => {
  it('converts a displayed percent to the stored fractional value', async () => {
    const module = await import('../../src/ui/pages/ProductsPage');
    const parsePercentToFraction = module.parsePercentToFraction;
    const validatePricingOverrides = module.validatePricingOverrides;

    expect(parsePercentToFraction).toBeTypeOf('function');
    expect(parsePercentToFraction(30)).toBeCloseTo(0.3);
    expect(validatePricingOverrides(0.25, 1, 12)).toContain('below 100%');
    expect(validatePricingOverrides(Number.NaN, 0.3, -1)).toContain('finite');
  });
});
