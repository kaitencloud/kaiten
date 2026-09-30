import { describe, expect, it } from 'vite-plus/test';
import {
  canBecomeDefault,
  getLicenseLifecycleState,
  getLifecycleTransition,
  isLicensePublished,
  isLifecycleTransitionBlocked,
} from '../license-lifecycle.utils';

describe('getLicenseLifecycleState', () => {
  it('reads the state off the license', () => {
    expect(getLicenseLifecycleState({ lifecycleState: 'DRAFT' })).toBe('DRAFT');
    expect(getLicenseLifecycleState({ lifecycleState: 'ARCHIVED' })).toBe(
      'ARCHIVED',
    );
  });

  // Fixtures and pre-lifecycle rows carry no state; they were all published,
  // and PUBLISHED is what the server assigns when a create omits it.
  it('treats an absent state as published', () => {
    expect(getLicenseLifecycleState({})).toBe('PUBLISHED');
    expect(isLicensePublished({})).toBe(true);
  });
});

describe('canBecomeDefault', () => {
  it('offers the action on a published version that is not the default', () => {
    expect(
      canBecomeDefault({ isDefault: false, lifecycleState: 'PUBLISHED' }),
    ).toBe(true);
    expect(canBecomeDefault({ isDefault: false })).toBe(true);
  });

  it('never offers it on the default itself', () => {
    expect(
      canBecomeDefault({ isDefault: true, lifecycleState: 'PUBLISHED' }),
    ).toBe(false);
  });

  // The API would refuse with UpdateLicense.DefaultMustBePublished.
  it('withholds it from drafts and archived versions', () => {
    expect(canBecomeDefault({ isDefault: false, lifecycleState: 'DRAFT' })).toBe(
      false,
    );
    expect(
      canBecomeDefault({ isDefault: false, lifecycleState: 'ARCHIVED' }),
    ).toBe(false);
  });
});

describe('getLifecycleTransition', () => {
  // One edge out of each state, and none back to DRAFT.
  it('offers each state its one transition', () => {
    expect(getLifecycleTransition({ lifecycleState: 'DRAFT' })).toBe('publish');
    expect(getLifecycleTransition({ lifecycleState: 'PUBLISHED' })).toBe(
      'archive',
    );
    expect(getLifecycleTransition({ lifecycleState: 'ARCHIVED' })).toBe(
      'unarchive',
    );
  });

  it('treats an absent state as published', () => {
    expect(getLifecycleTransition({})).toBe('archive');
  });
});

describe('isLifecycleTransitionBlocked', () => {
  // The API would refuse with ArchiveLicense.DefaultMustBePublished.
  it("blocks archiving the family's default", () => {
    expect(
      isLifecycleTransitionBlocked({
        isDefault: true,
        lifecycleState: 'PUBLISHED',
      }),
    ).toBe(true);
  });

  it('lets any other version move', () => {
    expect(
      isLifecycleTransitionBlocked({
        isDefault: false,
        lifecycleState: 'PUBLISHED',
      }),
    ).toBe(false);
    expect(
      isLifecycleTransitionBlocked({ isDefault: false, lifecycleState: 'DRAFT' }),
    ).toBe(false);
    expect(
      isLifecycleTransitionBlocked({
        isDefault: false,
        lifecycleState: 'ARCHIVED',
      }),
    ).toBe(false);
  });
});
