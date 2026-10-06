import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vite-plus/test';
import {
  getBillingCapabilitiesQueryKey,
  getBillingSettingsQueryKey,
  getEntitlementsUsageMetricsQueryKey,
  getInstanceBillingQueryKey,
  getInstanceQueryKey,
  getInvoiceQueryKey,
  getLicenseQueryKey,
  getUpcomingInvoiceQueryKey,
  listHandoffQueryKey,
  listInstanceInvoicesInfiniteQueryKey,
  listInstanceInvoicesQueryKey,
  listInvoicesInfiniteQueryKey,
  listInvoicesQueryKey,
  listLicensePricesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  invalidateBillingSettingsQueries,
  invalidateInstanceBillingQueries,
  invalidateInvoiceQueries,
  invalidateLicensePriceQueries,
} from '../queries';

// Each helper is checked against the entries a screen would have in the cache:
// the ones it must refresh, and unrelated ones it must leave alone.
const seed = (client: QueryClient, keys: readonly (readonly unknown[])[]) => {
  for (const key of keys) {
    client.setQueryData(key, { seeded: true });
  }
};

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

const path = { instanceSlug: 'initech-prod' };
const otherPath = { instanceSlug: 'other' };

describe('invalidateInstanceBillingQueries', () => {
  it('refreshes what an instance subscription changes, and only that instance', async () => {
    const client = new QueryClient();
    const touched = [
      getInstanceBillingQueryKey({ path }),
      getUpcomingInvoiceQueryKey({ path }),
      listInstanceInvoicesQueryKey({ path }),
      listInstanceInvoicesInfiniteQueryKey({ path, query: { limit: 50 } }),
      listInvoicesQueryKey(),
      listInvoicesInfiniteQueryKey({ query: { status: ['PAID'] } }),
      getEntitlementsUsageMetricsQueryKey({ path }),
      getInstanceQueryKey({ path }),
    ];
    const untouched = [
      getInstanceBillingQueryKey({ path: otherPath }),
      listInstanceInvoicesQueryKey({ path: otherPath }),
      getInstanceQueryKey({ path: otherPath }),
      listHandoffQueryKey(),
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateInstanceBillingQueries(client, 'initech-prod');

    for (const key of touched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });
});

describe('invalidateInvoiceQueries', () => {
  it('refreshes the lists, the handoff queue and the page of the invoice', async () => {
    const client = new QueryClient();
    const touched = [
      listInvoicesQueryKey(),
      listInvoicesInfiniteQueryKey({ query: { held: true } }),
      listHandoffQueryKey(),
      listInstanceInvoicesQueryKey({ path }),
      listInstanceInvoicesQueryKey({ path: otherPath }),
      getInvoiceQueryKey({ path: { invoiceId: 'inv-m1' } }),
    ];
    const untouched = [
      getInvoiceQueryKey({ path: { invoiceId: 'inv-h1' } }),
      getInstanceBillingQueryKey({ path }),
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateInvoiceQueries(client, 'inv-m1');

    for (const key of touched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it('leaves the page of every invoice alone when it is not told which one changed', async () => {
    const client = new QueryClient();
    const page = getInvoiceQueryKey({ path: { invoiceId: 'inv-m1' } });
    seed(client, [page, listInvoicesQueryKey()]);

    await invalidateInvoiceQueries(client);

    expect(invalidated(client, listInvoicesQueryKey())).toBe(true);
    expect(invalidated(client, page)).toBe(false);
  });
});

describe('invalidateLicensePriceQueries', () => {
  it('refreshes the prices of a version and the version', async () => {
    const client = new QueryClient();
    const prices = listLicensePricesQueryKey({ path: { licenseSlug: 'pro-v2' } });
    const version = getLicenseQueryKey({ path: { licenseSlug: 'pro-v2' } });
    const other = listLicensePricesQueryKey({ path: { licenseSlug: 'pro-v3' } });
    seed(client, [prices, version, other]);

    await invalidateLicensePriceQueries(client, 'pro-v2');

    expect(invalidated(client, prices)).toBe(true);
    expect(invalidated(client, version)).toBe(true);
    expect(invalidated(client, other)).toBe(false);
  });
});

describe('invalidateBillingSettingsQueries', () => {
  it('refreshes the settings and the capabilities they show', async () => {
    const client = new QueryClient();
    seed(client, [getBillingSettingsQueryKey(), getBillingCapabilitiesQueryKey()]);

    await invalidateBillingSettingsQueries(client);

    expect(invalidated(client, getBillingSettingsQueryKey())).toBe(true);
    expect(invalidated(client, getBillingCapabilitiesQueryKey())).toBe(true);
  });
});
