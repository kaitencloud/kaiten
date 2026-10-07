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
const customerSlugs = new Set(
  slot(config.customers).customers?.map(({ slug }) => slug),
);
const zoneIds = new Set(releaseManagement.deploymentZones.map(({ id }) => id));
const releaseIds = new Set(releaseManagement.releases.map(({ id }) => id));

describe('dev world', () => {
  it('seeds every area of the console', () => {
    expect(Object.keys(config).sort()).toEqual([
      'auditTrail',
      'billing',
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

  it('turns billing on, with NoOp to collect invoices', () => {
    const { capabilities, outage } = slot(config.billing);

    expect(outage).toBeNull();
    expect(capabilities.enabled).toBe(true);
    expect(capabilities.providers.map(({ kind }) => kind)).toEqual(['NOOP']);
  });

  it('prices the versions of the licenses, and only what they grant', () => {
    const { grants, prices } = slot(config.licenses).pricing;
    const licenseSlugs = new Set(
      slot(config.licenses).licenses.map(({ slug }) => slug),
    );

    expect(Object.keys(prices).length).toBeGreaterThan(0);
    for (const [slug, versionPrices] of Object.entries(prices)) {
      expect(licenseSlugs).toContain(slug);
      // One currency per version, and no deprecated price that is a default.
      expect(new Set(versionPrices.map(({ currency }) => currency)).size).toBe(1);
      for (const price of versionPrices) {
        expect(price.status === 'DEPRECATED' && price.isDefault).toBe(false);
        if (price.metered) {
          expect(
            grants.some(
              (grant) =>
                grant.licenseSlug === slug &&
                grant.entitlementSlug === price.metered?.entitlementSlug,
            ),
            `${slug} meters ${price.metered.entitlementSlug} without granting it`,
          ).toBe(true);
        }
      }
      // At most one default per billing period.
      const defaults = versionPrices
        .filter((price) => price.isDefault)
        .map(({ billingPeriod }) => billingPeriod);
      expect(new Set(defaults).size).toBe(defaults.length);
    }
    for (const slug of slot(config.licenses).pricing.billedVersions) {
      expect(licenseSlugs).toContain(slug);
    }
  });

  it('subscribes only instances of the world, to a flat fee of the version they run', () => {
    const { catalogue, subscriptions } = slot(slot(config.billing).subscriptions);
    const licenseOfInstance = new Map(
      catalogue.instances.map(({ instanceSlug, licenseSlug }) => [
        instanceSlug,
        licenseSlug,
      ]),
    );

    expect(subscriptions.length).toBeGreaterThan(0);
    for (const subscription of subscriptions) {
      expect(instanceSlugs).toContain(subscription.instanceSlug);
      expect(customerSlugs).toContain(subscription.customerSlug);
      const licenseSlug = licenseOfInstance.get(subscription.instanceSlug) ?? '';
      const price = catalogue.prices[licenseSlug]?.find(
        ({ id }) => id === subscription.basePrice.id,
      );
      expect(
        price,
        `${subscription.instanceSlug} is pinned to a price its version does not have`,
      ).toBeDefined();
      expect(price?.billingModel).toBe('FLAT_FEE');
    }
  });

  it('keeps a subscription that ended and an instance to subscribe, so that every state of the tab can be tried', () => {
    const { catalogue, subscriptions, upcoming } = slot(
      slot(config.billing).subscriptions,
    );
    const subscribed = new Set(subscriptions.map(({ instanceSlug }) => instanceSlug));

    expect(subscriptions.map(({ status }) => status)).toEqual(
      expect.arrayContaining(['ACTIVE', 'CANCELED']),
    );
    // One that nobody bills yet, on a version that is on sale and has a price.
    expect(
      catalogue.instances.some(
        ({ instanceSlug, licenseSlug, licenseState }) =>
          !subscribed.has(instanceSlug) &&
          licenseState === 'PUBLISHED' &&
          (catalogue.prices[licenseSlug] ?? []).some(
            ({ billingModel, status }) =>
              billingModel === 'FLAT_FEE' && status === 'ACTIVE',
          ),
      ),
    ).toBe(true);
    // What the next boundary issues is told only of a subscription that lives.
    for (const slug of Object.keys(upcoming)) {
      expect(
        subscriptions.find(({ instanceSlug }) => instanceSlug === slug)?.status,
      ).toBe('ACTIVE');
    }
  });

  it('keeps from deletion what bills, and tells which invoices are not settled', () => {
    const { billingBlocks } = instanceSlot;
    const { subscriptions } = slot(slot(config.billing).subscriptions);
    const subscribed = new Set(subscriptions.map(({ instanceSlug }) => instanceSlug));

    for (const [slug, block] of Object.entries(billingBlocks ?? {})) {
      expect(subscribed).toContain(slug);
      expect(['ACTIVE', 'CANCELED', 'TRIAL', 'PAST_DUE']).toContain(block.status);
    }
    for (const [slug, block] of Object.entries(
      slot(config.customers).billingBlocks ?? {},
    )) {
      expect(customerSlugs).toContain(slug);
      expect(block.unpaidInvoiceIds.length > 0 || block.live).toBe(true);
    }
  });

  it('keeps a journal of usage only for counters the instances report, more than a page of it for one, inside what is kept', () => {
    const { retentionStart, usageReports } = slot(instanceSlot.usageHistory);
    const sizes: number[] = [];

    expect(retentionStart).toBeDefined();
    for (const [instance, byEntitlement] of Object.entries(usageReports)) {
      expect(instanceSlugs).toContain(instance);
      for (const [entitlement, reports] of Object.entries(byEntitlement)) {
        expect(entitlementSlugs).toContain(entitlement);
        sizes.push(reports.length);
        const seqs = reports.map(({ reportSeq }) => reportSeq);
        expect(seqs).toEqual([...seqs].sort((left, right) => left - right));
        expect(new Set(seqs).size).toBe(seqs.length);
      }
    }
    expect(Math.max(...sizes)).toBeGreaterThan(100);
  });

  it('gives a customer a billing e-mail, and leaves another without one', () => {
    const emails = slot(config.customers).customers?.map(
      ({ billingEmail }) => billingEmail,
    );

    expect(emails?.some(Boolean)).toBe(true);
    expect(emails?.some((email) => !email)).toBe(true);
  });

  it('counts on the dashboard what the lists show', () => {
    const { data } = slot(config.dashboard);
    expect(data.customers).toHaveLength(customerIds.size);
    expect(data.instances).toHaveLength(instanceSlugs.size);
    expect(data.licenses).toHaveLength(licenseIds.size);
  });
});
