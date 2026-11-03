import { describe, expect, it } from 'vitest';
import { localDateString } from '../../src/engine/utils';

describe('R11 local date test timezone independence', () => {
  it('uses the local date of the constructed calendar time', () => {
    expect(localDateString(new Date(2026, 10, 2, 2, 0))).toBe('2026-11-02');
  });
});
