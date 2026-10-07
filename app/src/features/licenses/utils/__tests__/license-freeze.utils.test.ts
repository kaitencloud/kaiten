import { describe, expect, it } from 'vite-plus/test';
import { getVersionFreezeReason } from '../license-freeze.utils';

describe('why a version cannot be changed where it is', () => {
  it('is that a live subscription bills it, for the grants and for a new price', () => {
    for (const code of [
      'AssociateEntitlementToLicense.BillingActive',
      'UpdateLicenseEntitlement.BillingActive',
      'DeleteLicenseEntitlement.BillingActive',
      'CreateLicensePrice.BillingActive',
    ]) {
      expect(getVersionFreezeReason(code)).toBe('billed');
    }
  });

  it('is that its prices are immutable once it is published', () => {
    expect(getVersionFreezeReason('UpdateLicensePrice.VersionNotDraft')).toBe(
      'published',
    );
  });

  it('is that an archived version takes no new price', () => {
    expect(getVersionFreezeReason('CreateLicensePrice.VersionArchived')).toBe(
      'archived',
    );
  });

  it('is nothing for a refusal that is not about a version being frozen, whichever object is billed', () => {
    for (const code of [
      'UpdateInstance.BillingActive',
      'DeleteInstance.BillingActive',
      'DeleteCustomer.BillingActive',
      'CreateLicensePrice.DefaultConflict',
      'DeprecateLicensePrice.PlanChangeTarget',
      undefined,
    ]) {
      expect(getVersionFreezeReason(code)).toBeUndefined();
    }
  });
});
