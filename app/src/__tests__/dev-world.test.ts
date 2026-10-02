import { describe, expect, it } from 'vite-plus/test';
import { createDevMockConfig } from '@/e2e/msw/dev-world';

// The records of `pnpm run dev:mock` (src/e2e/msw/dev-world), tested here
// rather than beside them: the unit project leaves out every e2e/ folder.
// Building the config runs the E2E models, which check each seed against the
// API contract, so a contract change that a record no longer meets fails here
// rather than when someone starts dev:mock. The other tests hold the promise of
// the world: a link from one area leads to a record the other area serves.

const slot = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('The dev world left a slot out');
  }
  return value;
};

const config = createDevMockConfig();
const instanceSlot = slot(config.instances);
const releaseManagement = slot(config.releaseManagement);
const customerIds = new Set(slot(config.customers).customers?.map(({ id }) => id));
const licenseIds = new Set(slot(config.licenses).licenses.map(({ id }) => id));
const entitlementSlugs = new Set(
  slot(config.entitlements).entitlements.map(({ slug }) => slug),
);
const instanceSlugs = new Set(instanceSlot.instances.map(({ slug }) => slug));
const zoneIds = new Set(releaseManagement.deploymentZones.map(({ id }) => id));
const releaseIds = new Set(releaseManagement.releases.map(({ id }) => id));

describe('dev world', () => {
  it('seeds every area of the console', () => {
    expect(Object.keys(config).sort()).toEqual([
      'auditTrail',
      'connectors',
      'customers',
      'dashboard',
      'entitlements',
      'featureFlags',
      'instances',
      'licenses',
      'notifications',
      'releaseManagement',
    ]);
  });

  it('puts every instance on a customer, a license and a zone of the world', () => {
    for (const instance of instanceSlot.instances) {
      expect(customerIds).toContain(instance.customerId);
      expect(licenseIds).toContain(instance.licenseId);
      if (instance.deploymentZoneId) {
        expect(zoneIds).toContain(instance.deploymentZoneId);
      }
    }
    // The customers and release pages list the same instances.
    expect(
      new Set(slot(config.customers).instances?.map(({ slug }) => slug)),
    ).toEqual(instanceSlugs);
    for (const instance of releaseManagement.instances) {
      expect(instanceSlugs).toContain(instance.slug);
    }
  });

  it('grants and measures only entitlements of the catalogue', () => {
    for (const grant of instanceSlot.licenseEntitlements) {
      expect(licenseIds).toContain(grant.licenseId);
      expect(entitlementSlugs).toContain(grant.entitlementSlug);
    }
    for (const [slug, usages] of Object.entries(
      instanceSlot.entitlementUsagesByInstance,
    )) {
      expect(instanceSlugs).toContain(slug);
      for (const usage of usages) {
        expect(entitlementSlugs).toContain(usage.entitlementSlug);
      }
    }
  });

  it('runs each zone on a release of the world', () => {
    for (const zone of releaseManagement.deploymentZones) {
      if (zone.releaseId) {
        expect(releaseIds).toContain(zone.releaseId);
      }
    }
    for (const deployment of releaseManagement.deployments) {
      expect(zoneIds).toContain(deployment.deploymentZoneId);
      expect(releaseIds).toContain(deployment.releaseId);
    }
  });

  it('tells of the same records in the audit trail and the notifications', () => {
    for (const entry of slot(config.auditTrail).entries) {
      if (entry.instanceSlug) {
        expect(instanceSlugs).toContain(entry.instanceSlug);
      }
    }
    const releaseSlugs = new Set(
      releaseManagement.releases.map(({ slug }) => slug),
    );
    for (const { actionUrl = '' } of slot(config.notifications).notifications ??
      []) {
      const instance = /^\/customers\/instances\/([^/]+)/.exec(actionUrl);
      const release = /^\/releases\/([^/]+)$/.exec(actionUrl);
      if (instance) {
        expect(instanceSlugs).toContain(instance[1]);
      }
      if (release) {
        expect(releaseSlugs).toContain(release[1]);
      }
    }
  });

  it('counts on the dashboard what the lists show', () => {
    const { data } = slot(config.dashboard);
    expect(data.customers).toHaveLength(customerIds.size);
    expect(data.instances).toHaveLength(instanceSlugs.size);
    expect(data.licenses).toHaveLength(licenseIds.size);
  });
});
