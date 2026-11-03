import { describe, expect, it } from 'vitest';
import { parseCSV } from '../../src/io/io';

describe('R2 CSV parser edge cases after B8', () => {
  it('parses CRLF line endings', () => {
    expect(parseCSV('id,name\r\n1,Cake\r\n')).toEqual([{ id: '1', name: 'Cake' }]);
  });

  it('preserves an empty last field before a newline', () => {
    expect(parseCSV('id,name,notes\r\n1,Cake,\r\n')).toEqual([{ id: '1', name: 'Cake', notes: '' }]);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(parseCSV('id,name\n1,"A ""quoted"" item"')).toEqual([{ id: '1', name: 'A "quoted" item' }]);
  });

  it('preserves leading and trailing whitespace inside quoted fields', () => {
    expect(parseCSV('id,name\n1,"  sugar  "')).toEqual([{ id: '1', name: '  sugar  ' }]);
  });
});
