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
  listInstanceAddonsQueryKey,
  listLicensePricesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  allHandoffOptions,
  allInstanceInvoicesOptions,
} from '@/lib/api/all-pages-query-options';
import {
  invalidateBillingSettingsQueries,
  invalidateInstanceAddonQueries,
  invalidateInstanceBillingQueries,
  invalidateInvoiceQueries,
  invalidateLicensePriceQueries,
  invoicesQueryOptions,
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

// What the screens hold: every list is read whole, under the key the generated
// options give its operation, with what narrows it in the key. These are the entries a
// mutation has to reach, and they are the options' own keys, so that the test follows
// them if they change.
const organizationInvoices = invoicesQueryOptions().queryKey;
const customerInvoices = invoicesQueryOptions({ customerSlug: 'initech' }).queryKey;
const instanceScopedInvoices = invoicesQueryOptions({
  instanceSlug: 'initech-prod',
}).queryKey;
const instanceCardInvoices = allInstanceInvoicesOptions('initech-prod').queryKey;
const otherInstanceCardInvoices = allInstanceInvoicesOptions('other').queryKey;
const waitingQueue = allHandoffOptions({ status: 'PENDING' }).queryKey;
const bookedQueue = allHandoffOptions({ status: 'ACKNOWLEDGED' }).queryKey;

describe('invalidateInstanceBillingQueries', () => {
  it('refreshes what an instance subscription changes, and only that instance', async () => {
    const client = new QueryClient();
    const touched = [
      getInstanceBillingQueryKey({ path }),
      getUpcomingInvoiceQueryKey({ path }),
      instanceCardInvoices,
      organizationInvoices,
      customerInvoices,
      instanceScopedInvoices,
      listInstanceAddonsQueryKey({ path }),
      getEntitlementsUsageMetricsQueryKey({ path }),
      getInstanceQueryKey({ path }),
    ];
    const untouched = [
      getInstanceBillingQueryKey({ path: otherPath }),
      listInstanceAddonsQueryKey({ path: otherPath }),
      otherInstanceCardInvoices,
      getInstanceQueryKey({ path: otherPath }),
      waitingQueue,
      bookedQueue,
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

describe('invalidateInstanceAddonQueries', () => {
  it('refreshes the add-ons of an instance, what they apply to and what the next boundary bills, and only that instance', async () => {
    const client = new QueryClient();
    const touched = [
      listInstanceAddonsQueryKey({ path }),
      getEntitlementsUsageMetricsQueryKey({ path }),
      getUpcomingInvoiceQueryKey({ path }),
    ];
    const untouched = [
      listInstanceAddonsQueryKey({ path: otherPath }),
      getUpcomingInvoiceQueryKey({ path: otherPath }),
      // The subscription itself and the invoices already issued did not change.
      getInstanceBillingQueryKey({ path }),
      instanceCardInvoices,
      organizationInvoices,
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateInstanceAddonQueries(client, 'initech-prod');

    for (const key of touched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });
});

describe('invalidateInvoiceQueries', () => {
  it('refreshes every list under any scope, both parts of the handoff queue and the page of the invoice', async () => {
    const client = new QueryClient();
    const touched = [
      organizationInvoices,
      customerInvoices,
      instanceScopedInvoices,
      waitingQueue,
      bookedQueue,
      instanceCardInvoices,
      otherInstanceCardInvoices,
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
    seed(client, [page, organizationInvoices]);

    await invalidateInvoiceQueries(client);

    expect(invalidated(client, organizationInvoices)).toBe(true);
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
