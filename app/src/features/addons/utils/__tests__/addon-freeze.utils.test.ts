import { describe, expect, it } from 'vite-plus/test';
import {
  ADDON_FREEZE_DESCRIPTION_KEYS,
  ADDON_FREEZE_TITLE_KEYS,
  getAddonFreezeReason,
} from '../addon-freeze.utils';

describe('why a version cannot be changed where it is', () => {
  it.each([
    'AssignAddonEntitlement.BillingActive',
    'UpdateAddonEntitlement.BillingActive',
    'UnassignAddonEntitlement.BillingActive',
    'CreateAddonPrice.BillingActive',
  ])('is that an instance with a live subscription holds it, for %s', (code) => {
    expect(getAddonFreezeReason(code)).toBe('billed');
  });

  it('is that it is archived, for the price it takes no more of', () => {
    expect(getAddonFreezeReason('CreateAddonPrice.VersionArchived')).toBe('archived');
  });

  it('is nothing for any other refusal, or for a failure that has no code', () => {
    expect(getAddonFreezeReason('CreateAddonPrice.CurrencyMismatch')).toBeUndefined();
    expect(getAddonFreezeReason('DeleteAddon.InUseConflict')).toBeUndefined();
    expect(getAddonFreezeReason(undefined)).toBeUndefined();
  });

  it('is told in the same words for each reason in both tables', () => {
    expect(Object.keys(ADDON_FREEZE_TITLE_KEYS).sort()).toEqual(['archived', 'billed']);
    expect(Object.keys(ADDON_FREEZE_DESCRIPTION_KEYS).sort()).toEqual(['archived', 'billed']);
  });
});
