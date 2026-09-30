import { describe, expect, it } from 'vite-plus/test';
import { buildEntitlementSaturationHeatmap } from '../dashboard-metrics-license-charts';

const PERIOD = {
  currentPeriodStart: '2026-03-01T00:00:00.000Z',
  currentPeriodEnd: '2026-04-01T00:00:00.000Z',
};

const numberEntitlement = (entitlementSlug: string, value: number) => ({
  entitlementName: entitlementSlug,
  entitlementSlug,
  entitlementType: 'NUMBER',
  licenseId: 'license-1',
  licenseSlug: 'pro',
  value: { type: 'number', value },
});

const usage = (
  entitlementSlug: string,
  value: number,
  period?: typeof PERIOD,
) => ({
  entitlementId: `ent-${entitlementSlug}`,
  entitlementSlug,
  licenseId: 'license-1',
  licenseSlug: 'pro',
  value: { type: 'number', value },
  ...period,
});

const buildHeatmap = (usages: ReturnType<typeof usage>[]) =>
  buildEntitlementSaturationHeatmap(
    [{ slug: 'acme-prod' }] as never,
    [{ slug: 'pro', type: 'PAID' }] as never,
    {
      entitlementUsagesByInstanceSlug: { 'acme-prod': usages },
      licenseEntitlementsByLicenseSlug: {
        pro: [
          numberEntitlement('api-calls', 100),
          numberEntitlement('storage-gb', 100),
        ],
      },
    } as never,
  );

const trialUsage = (
  entitlementSlug: string,
  value: number,
  period?: typeof PERIOD,
) => ({
  ...usage(entitlementSlug, value, period),
  licenseSlug: 'starter',
});

const buildTwoLicenseHeatmap = (usages: ReturnType<typeof usage>[]) =>
  buildEntitlementSaturationHeatmap(
    [{ slug: 'acme-prod' }, { slug: 'acme-trial' }] as never,
    [
      { slug: 'pro', type: 'PAID' },
      { slug: 'starter', type: 'TRIAL' },
    ] as never,
    {
      entitlementUsagesByInstanceSlug: {
        'acme-prod': usages.filter((row) => row.licenseSlug === 'pro'),
        'acme-trial': usages.filter((row) => row.licenseSlug === 'starter'),
      },
      licenseEntitlementsByLicenseSlug: {
        pro: [
          numberEntitlement('api-calls', 100),
          numberEntitlement('storage-gb', 100),
        ],
        starter: [
          { ...numberEntitlement('api-calls', 100), licenseSlug: 'starter' },
          { ...numberEntitlement('storage-gb', 100), licenseSlug: 'starter' },
        ],
      },
    } as never,
  );

describe('buildEntitlementSaturationHeatmap', () => {
  // A soft limit still has room past the granted value, so the heatmap must
  // band it against what the API actually accepts.
  it('bands a soft-limited grant against its stretched ceiling', () => {
    const { entitlementSaturationHeatmap, overThresholdUsage } =
      buildEntitlementSaturationHeatmap(
        [{ slug: 'acme-prod' }] as never,
        [{ slug: 'pro', type: 'PAID' }] as never,
        {
          entitlementUsagesByInstanceSlug: {
            'acme-prod': [usage('api-calls', 110)],
          },
          licenseEntitlementsByLicenseSlug: {
            pro: [
              {
                ...numberEntitlement('api-calls', 100),
                limitCapExceededOveragePercent: 25,
              },
            ],
          },
        } as never,
      );

    expect(entitlementSaturationHeatmap).toEqual([
      {
        between50And80: 0,
        between80And100: 1,
        licenseType: 'PAID',
        over100: 0,
        unbounded: 0,
        under50: 0,
        usageScope: 'LIFETIME',
      },
    ]);
    expect(overThresholdUsage).toBe(0);
  });

  it('keeps lifetime and period-scoped counters in separate rows', () => {
    const { entitlementSaturationHeatmap } = buildHeatmap([
      usage('storage-gb', 85),
      usage('api-calls', 85, PERIOD),
    ]);

    expect(entitlementSaturationHeatmap).toEqual([
      {
        between50And80: 0,
        between80And100: 1,
        licenseType: 'PAID',
        over100: 0,
        unbounded: 0,
        under50: 0,
        usageScope: 'LIFETIME',
      },
      {
        between50And80: 0,
        between80And100: 1,
        licenseType: 'PAID',
        over100: 0,
        unbounded: 0,
        under50: 0,
        usageScope: 'PERIODIC',
      },
    ]);
  });

  it('reports the period-scoped share of the near-threshold headline', () => {
    const summary = buildHeatmap([
      usage('storage-gb', 85),
      usage('api-calls', 85, PERIOD),
    ]);

    expect(summary.nearThresholdUsage).toBe(2);
    expect(summary.nearThresholdUsageCurrentPeriod).toBe(1);
  });

  // Rows arrive in report order, which interleaves scopes and license types.
  // The heatmap groups by license type with the durable signal first, so the
  // ordering is part of the contract rather than an accident.
  it('groups rows by license type, lifetime before periodic', () => {
    const { entitlementSaturationHeatmap } = buildTwoLicenseHeatmap([
      trialUsage('api-calls', 85, PERIOD),
      usage('api-calls', 85, PERIOD),
      trialUsage('storage-gb', 85),
      usage('storage-gb', 85),
    ]);

    expect(
      entitlementSaturationHeatmap.map(
        (row) => `${row.licenseType}/${row.usageScope}`,
      ),
    ).toEqual([
      'PAID/LIFETIME',
      'PAID/PERIODIC',
      'TRIAL/LIFETIME',
      'TRIAL/PERIODIC',
    ]);
  });

  // A feature flag has no saturation; it must not be swept into the row the
  // reader now sees titled "Lifetime total".
  it('ignores entitlements whose usage is not a number', () => {
    const { entitlementSaturationHeatmap } = buildHeatmap([
      usage('storage-gb', 85),
      {
        entitlementId: 'ent-saml',
        entitlementSlug: 'saml-sso',
        licenseId: 'license-1',
        licenseSlug: 'pro',
        value: { type: 'boolean', value: true },
      } as never,
    ]);

    expect(entitlementSaturationHeatmap).toHaveLength(1);
    expect(entitlementSaturationHeatmap[0].unbounded).toBe(0);
    expect(entitlementSaturationHeatmap[0].between80And100).toBe(1);
  });

  it('emits a single row when no entitlement declares a reset period', () => {
    const { entitlementSaturationHeatmap, nearThresholdUsageCurrentPeriod } =
      buildHeatmap([usage('storage-gb', 10), usage('api-calls', 85)]);

    expect(entitlementSaturationHeatmap).toHaveLength(1);
    expect(entitlementSaturationHeatmap[0].usageScope).toBe('LIFETIME');
    expect(nearThresholdUsageCurrentPeriod).toBe(0);
  });
});
