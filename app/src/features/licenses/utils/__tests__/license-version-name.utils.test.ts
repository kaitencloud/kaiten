import { describe, expect, it } from 'vite-plus/test';
import { suggestNextVersionName } from '../license-version-name.utils';

describe('suggestNextVersionName', () => {
  it('bumps the highest trailing number in the family', () => {
    expect(suggestNextVersionName(['v1', 'v3', 'v2'])).toBe('v4');
    expect(suggestNextVersionName(['2024.3', '2024.1'])).toBe('2024.4');
  });

  it('keeps the zero padding of the number it bumps', () => {
    expect(suggestNextVersionName(['Release 09'])).toBe('Release 10');
    expect(suggestNextVersionName(['v007'])).toBe('v008');
  });

  it('skips a name the family already uses', () => {
    expect(suggestNextVersionName(['v1', 'v2', 'v 2'])).toBe('v3');
    expect(suggestNextVersionName(['v1', 'v2', 'v3', 'v2'])).toBe('v4');
  });

  it('suggests nothing when no name ends with a number', () => {
    expect(suggestNextVersionName(['GA', 'Legacy'])).toBe('');
    expect(suggestNextVersionName([undefined, null, ''])).toBe('');
    expect(suggestNextVersionName([])).toBe('');
  });
});
