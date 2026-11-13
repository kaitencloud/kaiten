import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { DashboardLicenseEnding, DashboardSummary } from '@/api-client';
import { buildCustomersAttention, licensesEndingAtRisk } from '../attention';

const t = ((key: string) => key) as unknown as TFunction;

const empty = { count: 0, items: [] };

function ending(
  overrides: Partial<DashboardLicenseEnding>,
): DashboardLicenseEnding {
  return {
    instanceSlug: 'acme-prod',
    instanceName: 'Acme prod',
    customerSlug: 'acme',
    customerName: 'Acme',
    licenseName: 'Pro',
    endsAt: '2026-12-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    ...overrides,
  } as DashboardLicenseEnding;
}

function summaryWith(
  items: DashboardLicenseEnding[],
  billing: DashboardSummary['billing'],
): DashboardSummary {
  return {
    billing,
    licenses: { ending: { items } },
    attention: {
      limitsReached: empty,
      nearThreshold: empty,
      rejectedReports24h: empty,
      silentInstances: empty,
      instancesNotHealthy: empty,
      licensesEnding30d: { count: items.length, items },
      archivedVersions: empty,
      tokensExpiring30d: empty,
      zonesBehind: empty,
      checked: [],
    },
  } as unknown as DashboardSummary;
}

const billing = {} as NonNullable<DashboardSummary['billing']>;

describe('the Licenses ending, without read:billing', () => {
  it('puts none at risk, since a blank status says nothing', () => {
    const summary = summaryWith([ending({})], undefined);

    expect(licensesEndingAtRisk(summary)).toEqual([]);
  });

  it('does not say the instance has no subscription', () => {
    const summary = summaryWith([ending({})], undefined);

    const [line] = buildCustomersAttention(summary, t, 'en');

    expect(line.detail).toBe(
      'Pages.Dashboard.attention.lines.licenseEnding.detailNoBilling',
    );
  });
});

describe('the Licenses ending, with read:billing', () => {
  it.each([
    ['no subscription', {}],
    ['past due', { billingStatus: 'PAST_DUE' }],
    ['canceled', { billingStatus: 'CANCELED' }],
    ['incomplete', { billingStatus: 'INCOMPLETE' }],
    ['ending with its period', { billingStatus: 'ACTIVE', cancelAtPeriodEnd: true }],
  ])('puts one at risk when it has %s', (_label, overrides) => {
    const summary = summaryWith([ending(overrides)], billing);

    expect(licensesEndingAtRisk(summary)).toHaveLength(1);
  });

  it('leaves out a subscription that renews', () => {
    const summary = summaryWith(
      [ending({ billingStatus: 'ACTIVE' })],
      billing,
    );

    expect(licensesEndingAtRisk(summary)).toEqual([]);
  });

  it('says what the subscription says on the attention line', () => {
    const summary = summaryWith([ending({})], billing);

    const [line] = buildCustomersAttention(summary, t, 'en');

    expect(line.detail).toBe(
      'Pages.Dashboard.attention.lines.licenseEnding.detail',
    );
  });
});
