import { describe, expect, it } from 'vite-plus/test';
import {
  canBecomeDefault,
  getLifecycleTransition,
  isLifecycleTransitionBlocked,
  isPublished,
} from '../addon-lifecycle.utils';

describe('the lifecycle of a version', () => {
  it('accepts exactly one transition in each state, and nothing leads back to a draft', () => {
    expect(getLifecycleTransition({ lifecycleState: 'DRAFT' })).toBe('publish');
    expect(getLifecycleTransition({ lifecycleState: 'PUBLISHED' })).toBe('archive');
    expect(getLifecycleTransition({ lifecycleState: 'ARCHIVED' })).toBe('unarchive');
  });

  it('lets a published version, and no other, become the default of its family', () => {
    expect(canBecomeDefault({ isDefault: false, lifecycleState: 'PUBLISHED' })).toBe(true);
    expect(canBecomeDefault({ isDefault: true, lifecycleState: 'PUBLISHED' })).toBe(false);
    expect(canBecomeDefault({ isDefault: false, lifecycleState: 'DRAFT' })).toBe(false);
    expect(canBecomeDefault({ isDefault: false, lifecycleState: 'ARCHIVED' })).toBe(false);
  });

  it('keeps the default of a family from being archived, which the API refuses', () => {
    expect(isLifecycleTransitionBlocked({ isDefault: true, lifecycleState: 'PUBLISHED' })).toBe(true);
    expect(isLifecycleTransitionBlocked({ isDefault: false, lifecycleState: 'PUBLISHED' })).toBe(false);
    // Publishing and unarchiving are never blocked by the flag.
    expect(isLifecycleTransitionBlocked({ isDefault: false, lifecycleState: 'DRAFT' })).toBe(false);
    expect(isLifecycleTransitionBlocked({ isDefault: false, lifecycleState: 'ARCHIVED' })).toBe(false);
  });

  it('is on sale when published', () => {
    expect(isPublished({ lifecycleState: 'PUBLISHED' })).toBe(true);
    expect(isPublished({ lifecycleState: 'DRAFT' })).toBe(false);
    expect(isPublished({ lifecycleState: 'ARCHIVED' })).toBe(false);
  });
});
