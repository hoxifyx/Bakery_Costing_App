import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compute } from '../src/engine/engine';
import type { AppData } from '../src/engine/types';

const exportPath = process.env.BAKERY_EXPORT_PATH;

describe('real export engine health', () => {
  it.skipIf(!exportPath)('computes the supplied full export without warnings', () => {
    const data = JSON.parse(readFileSync(exportPath!, 'utf8')) as AppData;
    expect(compute(data).all_warnings).toHaveLength(0);
  });
});