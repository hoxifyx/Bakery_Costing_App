import { describe, expect, it } from 'vitest';
import { EMPTY_APP_DATA } from '../../src/engine/types';
import { parseImportFile } from '../../src/io/io';

describe('R9 non-object JSON import input', () => {
  it('returns an invalid preview for JSON null instead of throwing', () => {
    expect(() => parseImportFile('null', EMPTY_APP_DATA)).not.toThrow();
    expect(parseImportFile('null', EMPTY_APP_DATA).valid).toBe(false);
  });

  it('returns an invalid preview for JSON primitives', () => {
    expect(parseImportFile('42', EMPTY_APP_DATA).valid).toBe(false);
    expect(parseImportFile('"bakery-costing-data"', EMPTY_APP_DATA).valid).toBe(false);
  });
});
