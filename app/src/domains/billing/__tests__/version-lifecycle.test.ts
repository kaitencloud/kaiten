import { describe, expect, it } from 'vite-plus/test';
import {
  getAddonTitle,
  getVersionTransition,
  isDefaultArchiveBlocked,
} from '../logic';

describe('the lifecycle of a version', () => {
  it('accepts exactly one transition in each state, and never leads back to a draft', () => {
    expect(getVersionTransition('DRAFT')).toBe('publish');
    expect(getVersionTransition('PUBLISHED')).toBe('archive');
    expect(getVersionTransition('ARCHIVED')).toBe('unarchive');
  });

  it('withholds the archive of the default of a family, and nothing else', () => {
    expect(isDefaultArchiveBlocked('PUBLISHED', true)).toBe(true);
    expect(isDefaultArchiveBlocked('PUBLISHED', false)).toBe(false);
    expect(isDefaultArchiveBlocked('PUBLISHED', undefined)).toBe(false);
    // A default is always published; any other state moves along its own edge.
    expect(isDefaultArchiveBlocked('ARCHIVED', true)).toBe(false);
    expect(isDefaultArchiveBlocked('DRAFT', true)).toBe(false);
  });
});

describe('the title of a version of an add-on', () => {
  it('is its name and which version it is, since the versions of a product share a name', () => {
    expect(getAddonTitle({ name: 'Extra seats', versionName: '2026' })).toBe(
      'Extra seats · 2026',
    );
  });
});
