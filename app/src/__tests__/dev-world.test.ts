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

  it('turns billing on, with NoOp and a connected Stripe to collect invoices', () => {
    const { capabilities, outage } = slot(config.billing);

    expect(outage).toBeNull();
    expect(capabilities.enabled).toBe(true);
    expect(capabilities.providers.map(({ kind }) => kind)).toEqual([
      'NOOP',
      'STRIPE',
    ]);
    expect(
      capabilities.providers.find(({ kind }) => kind === 'STRIPE'),
    ).toMatchObject({ connected: true, livemode: false });
    // As the API serves them: the release ships these three, whatever Stripe can
    // do here, and the public surface is on wherever billing is.
    expect(capabilities.features).toMatchObject({
      chargeAutomatically: true,
      publicSurface: true,
      stripe: true,
    });
    expect(capabilities.publicSurface.enabled).toBe(true);
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

  it('lists in the public catalogue the family that is sold self-serve, and no other', () => {
    const { licenses, publicFamilyIds } = slot(config.licenses);
    const families = new Set(licenses.map(({ familyId }) => familyId));

    expect(publicFamilyIds).toEqual(['family-starter']);
    expect(families).toContain('family-starter');
    // It has a published default version, which is what the catalogue serves.
    expect(
      licenses.some(
        (license) =>
          license.familyId === 'family-starter' &&
          license.isDefault &&
          license.lifecycleState === 'PUBLISHED',
      ),
    ).toBe(true);
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

  it('sells add-ons in every state, that grant entitlements of the catalogue and fit license families of the world', () => {
    const { addonCatalogue, capabilities } = slot(config.billing);
    const catalogue = slot(addonCatalogue);
    const versionSlugs = new Set(catalogue.versions.map(({ slug }) => slug));
    const families = new Set(
      slot(config.licenses).licenses.map(({ familyId }) =>
        familyId?.replace(/^family-/, ''),
      ),
    );

    expect(capabilities.features.addons).toBe(true);
    expect(new Set(catalogue.versions.map((version) => version.lifecycleState))).toEqual(
      new Set(['ARCHIVED', 'DRAFT', 'PUBLISHED']),
    );
    expect(new Set(catalogue.versions.map((version) => version.pricingType))).toEqual(
      new Set(['CUSTOM', 'FREE', 'PAID']),
    );
    // A family lists in the public catalogue, and another does not.
    expect(catalogue.publicFamilies.length).toBeGreaterThan(0);
    expect(
      catalogue.versions.some(
        ({ familySlug }) => !catalogue.publicFamilies.includes(familySlug),
      ),
    ).toBe(true);
    for (const family of catalogue.licenseFamilies) {
      expect(families).toContain(family);
    }
    for (const [slug, grants] of Object.entries(catalogue.grants)) {
      expect(versionSlugs).toContain(slug);
      for (const grant of grants) {
        expect(entitlementSlugs).toContain(grant.entitlementSlug);
      }
    }
    for (const [slug, compatible] of Object.entries(catalogue.compatibility)) {
      expect(versionSlugs).toContain(slug);
      for (const family of compatible) {
        expect(catalogue.licenseFamilies).toContain(family);
      }
    }
    for (const [slug, prices] of Object.entries(catalogue.prices)) {
      expect(versionSlugs).toContain(slug);
      // A price is only on a version that is sold, with one currency, and at most one default per period.
      expect(
        catalogue.versions.find((version) => version.slug === slug)?.pricingType,
      ).toBe('PAID');
      expect(new Set(prices.map(({ currency }) => currency)).size).toBe(1);
      for (const price of prices) {
        expect(price.billingModel).toBe('FLAT_FEE');
        expect(price.status === 'DEPRECATED' && price.isDefault).toBe(false);
      }
      const defaults = prices
        .filter((price) => price.isDefault)
        .map(({ billingPeriod }) => billingPeriod);
      expect(new Set(defaults).size).toBe(defaults.length);
    }
  });

  it('attaches add-ons only to instances whose license family they fit, at the price of the period their subscription bills', () => {
    const billing = slot(config.billing);
    const catalogue = slot(billing.addonCatalogue);
    const { catalogue: billed, instanceAddons, subscriptions } = slot(
      billing.subscriptions,
    );
    const attachments = slot(instanceAddons).attachments;

    expect(Object.keys(attachments).length).toBeGreaterThan(0);
    for (const [instanceSlug, held] of Object.entries(attachments)) {
      expect(instanceSlugs).toContain(instanceSlug);
      const family = billed.instances.find(
        (instance) => instance.instanceSlug === instanceSlug,
      )?.licenseFamilySlug;
      const subscription = subscriptions.find(
        (candidate) => candidate.instanceSlug === instanceSlug,
      );
      // An instance holds add-ons through a subscription, ended or not.
      expect(subscription, `${instanceSlug} holds add-ons and is not billed`).toBeDefined();
      for (const attached of held) {
        const version = catalogue.versions.find(
          ({ slug }) => slug === attached.addonSlug,
        );
        expect(version, `${attached.addonSlug} is not in the catalogue`).toBeDefined();
        expect(catalogue.compatibility[attached.addonSlug]).toContain(family);
        expect(attached.quantity).toBeLessThanOrEqual(
          version?.maxQuantity ?? Number.POSITIVE_INFINITY,
        );
        for (const price of attached.prices) {
          expect(catalogue.prices[attached.addonSlug]).toContainEqual(price);
          expect(price.billingPeriod).toBe(subscription?.billingPeriod);
        }
      }
    }
  });

  it('includes the add-ons an instance holds in the limits it shows', () => {
    const limitOf = (instanceSlug: string, entitlementSlug: string) =>
      instanceSlot.entitlementUsagesByInstance[instanceSlug]?.find(
        (usage) => usage.entitlementSlug === entitlementSlug,
      )?.limit;

    // Starter grants ten seats and two units of five were attached.
    expect(limitOf('globex-staging', 'seats')).toEqual({ type: 'number', value: 20 });
    // An instance that holds nothing keeps what its license grants.
    expect(limitOf('gamma-production', 'seats')).toEqual({ type: 'number', value: 10 });
  });

  it('issues publishable keys that are live or revoked, and holds only the last four characters of each', () => {
    const { keys } = slot(slot(config.billing).publishableKeys);

    expect(keys.filter(({ revokedAt }) => !revokedAt)).not.toHaveLength(0);
    expect(keys.filter(({ revokedAt }) => revokedAt)).not.toHaveLength(0);
    // A live key that no browser origin may send is a real case (server-side rendering).
    expect(keys.some(({ allowedOrigins }) => allowedOrigins.length === 0)).toBe(
      true,
    );
    for (const key of keys) {
      expect(key.keyHint).toHaveLength(4);
      expect(JSON.stringify(key)).not.toContain('pk_');
      for (const origin of key.allowedOrigins) {
        expect(origin).toMatch(/^https:\/\/|^http:\/\/localhost(:\d+)?$/);
      }
    }
  });

  it('issues vouchers of both types in every state, that name customers, licenses and prices of the world', () => {
    const billing = slot(config.billing);
    const { redemptions, vouchers } = slot(billing.voucherCatalogue);
    const addonCatalogue = slot(billing.addonCatalogue);
    const { catalogue } = slot(billing.subscriptions);
    const priceIds = new Set(
      Object.values(catalogue.prices).flatMap((prices) =>
        prices.map(({ id }) => id),
      ),
    );
    const addonPriceIds = new Set(
      Object.values(addonCatalogue.prices).flatMap((prices) =>
        prices.map(({ id }) => id),
      ),
    );
    const addonIds = new Set(addonCatalogue.versions.map(({ id }) => id));

    expect(billing.capabilities.features.vouchers).toBe(true);
    expect(new Set(vouchers.map(({ voucherType }) => voucherType))).toEqual(
      new Set(['ENTITLEMENT_BOOST', 'PRICE']),
    );
    expect(new Set(vouchers.map(({ status }) => status))).toEqual(
      new Set(['ACTIVE', 'ARCHIVED', 'DRAFT', 'EXHAUSTED']),
    );
    // One whose window closed, which the API never says: it is still ACTIVE.
    expect(
      vouchers.some(
        ({ expiresAt, status }) =>
          status === 'ACTIVE' && expiresAt && Date.parse(expiresAt) < Date.now(),
      ),
    ).toBe(true);
    for (const voucher of vouchers) {
      if (voucher.restrictedCustomerSlug) {
        expect(customerSlugs).toContain(voucher.restrictedCustomerSlug);
      }
      for (const id of voucher.applicableLicenseIds) {
        expect(licenseIds).toContain(id);
      }
      for (const id of voucher.applicableLicensePriceIds) {
        expect(priceIds).toContain(id);
      }
      for (const id of voucher.applicableAddonIds) {
        expect(addonIds).toContain(id);
      }
      for (const id of voucher.applicableAddonPriceIds) {
        expect(addonPriceIds).toContain(id);
      }
      for (const grant of voucher.grants) {
        expect(entitlementSlugs).toContain(grant.entitlementSlug);
      }
    }
    // A redemption is of a voucher of the world, by an instance of the world, and the
    // vouchers count them.
    for (const redemption of redemptions) {
      expect(instanceSlugs).toContain(redemption.instanceSlug);
      expect(
        vouchers.find(({ id }) => id === redemption.voucherId)?.voucherType,
      ).toBe(redemption.voucherType);
    }
    for (const voucher of vouchers) {
      expect(
        redemptions.filter(({ voucherId }) => voucherId === voucher.id).length,
        `${voucher.name} counts the redemptions it lists`,
      ).toBe(voucher.redemptionsCount);
    }
    // Redemptions in every status.
    expect(new Set(redemptions.map(({ status }) => status))).toEqual(
      new Set(['ACTIVE', 'EXPIRED', 'REVOKED']),
    );
  });

  it('discounts the invoice of an agreement with the line its redemption names, and includes a boost in the limits it shows', () => {
    const { invoices } = slot(slot(config.billing).invoices);
    const { redemptions } = slot(slot(config.billing).voucherCatalogue);
    const discounts = invoices.flatMap(({ lines }) =>
      lines.filter(({ type }) => type === 'DISCOUNT'),
    );

    expect(discounts.length).toBeGreaterThan(0);
    for (const line of discounts) {
      expect(
        redemptions.find(({ id }) => id === line.instanceVoucherId),
        'a discount line names a redemption of the world',
      ).toBeDefined();
    }
    const discounted = invoices.find(({ lines }) =>
      lines.some(({ type }) => type === 'DISCOUNT'),
    );
    expect(discounted?.discountTotal).toBeGreaterThan(0);
    expect(discounted?.total).toBe(
      (discounted?.subtotal ?? 0) - (discounted?.discountTotal ?? 0),
    );
    // Business grants a hundred thousand calls and the boost of Globex Production adds fifty thousand.
    expect(
      instanceSlot.entitlementUsagesByInstance['globex-production']?.find(
        ({ entitlementSlug }) => entitlementSlug === 'api-calls',
      )?.limit,
    ).toEqual({ type: 'number', value: 150_000 });
  });

  it('keeps a subscription that ended and an instance to subscribe, so that every state of the tab can be tried', () => {
    const { catalogue, subscriptions, upcoming } = slot(
      slot(config.billing).subscriptions,
    );
    const subscribed = new Set(subscriptions.map(({ instanceSlug }) => instanceSlug));

    expect(subscriptions.map(({ status }) => status)).toEqual(
      expect.arrayContaining(['ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIAL']),
    );
    // A cancellation waiting for the boundary, and a plan change waiting for it.
    expect(subscriptions.some(({ cancelAtPeriodEnd }) => cancelAtPeriodEnd)).toBe(
      true,
    );
    expect(subscriptions.some(({ scheduledChange }) => scheduledChange)).toBe(
      true,
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
        ['ACTIVE', 'PAST_DUE', 'TRIAL'],
        `${slug} has an upcoming invoice and does not live`,
      ).toContain(
        subscriptions.find(({ instanceSlug }) => instanceSlug === slug)?.status,
      );
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
