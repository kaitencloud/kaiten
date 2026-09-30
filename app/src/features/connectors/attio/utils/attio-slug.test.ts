import { describe, expect, it } from 'vite-plus/test';
import { isValidAttioSlug } from './attio-slug';

describe('isValidAttioSlug', () => {
  it.each(['name', 'workspace_id', 'kaiten_customer_id', 'a1_b2'])(
    'accepts %s',
    (slug) => {
      expect(isValidAttioSlug(slug)).toBe(true);
    },
  );

  it.each(['Workspace', 'my-slug', 'my slug', '_leading', 'trailing_', ''])(
    'rejects %s',
    (slug) => {
      expect(isValidAttioSlug(slug)).toBe(false);
    },
  );

  it('trims surrounding whitespace before checking', () => {
    expect(isValidAttioSlug('  workspace_id  ')).toBe(true);
  });
});
