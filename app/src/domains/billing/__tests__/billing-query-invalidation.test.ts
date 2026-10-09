import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vite-plus/test';
import {
  getBillingCapabilitiesQueryKey,
  getBillingHealthQueryKey,
  getBillingSettingsQueryKey,
  getConnectorSettingsQueryKey,
  getCustomerBillingQueryKey,
  getEntitlementsUsageMetricsQueryKey,
  getInstanceBillingQueryKey,
  getInstanceQueryKey,
  getInvoiceQueryKey,
  getLicenseQueryKey,
  getUpcomingInvoiceQueryKey,
  getVoucherQueryKey,
  listInstanceAddonsQueryKey,
  listInstanceVouchersQueryKey,
  listLicensePricesQueryKey,
  listVoucherRedemptionsQueryKey,
  listVouchersQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  allHandoffOptions,
  allInstanceInvoicesOptions,
} from '@/lib/api/all-pages-query-options';
import {
  invalidateBillingProviderQueries,
  invalidateBillingSettingsQueries,
  invalidateCustomerBillingQueries,
  invalidateInstanceAddonQueries,
  invalidateInstanceBillingQueries,
  invalidateInstanceVoucherQueries,
  invalidateInvoiceQueries,
  invalidateLicensePriceQueries,
  invalidateProviderSyncQueries,
  invalidateVoucherQueries,
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
      // A subscribe takes a voucher code: what the instance redeemed is read again.
      listInstanceVouchersQueryKey({ path }),
      // ... and the voucher it was of, which the response does not name, counted it.
      getVoucherQueryKey({ path: { voucherId: 'v-1' } }),
      listVoucherRedemptionsQueryKey({ path: { voucherId: 'v-1' } }),
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

describe('invalidateVoucherQueries', () => {
  it('refreshes the list of vouchers, and the page and the redemptions of the one it is told', async () => {
    const client = new QueryClient();
    const touched = [
      listVouchersQueryKey(),
      getVoucherQueryKey({ path: { voucherId: 'v-1' } }),
      listVoucherRedemptionsQueryKey({ path: { voucherId: 'v-1' } }),
    ];
    const untouched = [
      getVoucherQueryKey({ path: { voucherId: 'v-2' } }),
      listVoucherRedemptionsQueryKey({ path: { voucherId: 'v-2' } }),
      getInstanceBillingQueryKey({ path }),
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateVoucherQueries(client, 'v-1');

    for (const key of touched) {
      expect(invalidated(client, key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key)).toBe(false);
    }
  });

  it('leaves the page of every voucher alone when it is not told which one changed', async () => {
    const client = new QueryClient();
    const list = listVouchersQueryKey();
    const page = getVoucherQueryKey({ path: { voucherId: 'v-1' } });
    seed(client, [list, page]);

    await invalidateVoucherQueries(client);

    expect(invalidated(client, list)).toBe(true);
    expect(invalidated(client, page)).toBe(false);
  });
});

describe('invalidateInstanceVoucherQueries', () => {
  it('refreshes what an instance redeemed, what a boost changed, what the next boundary bills and the voucher, and only that instance', async () => {
    const client = new QueryClient();
    const touched = [
      listInstanceVouchersQueryKey({ path }),
      getEntitlementsUsageMetricsQueryKey({ path }),
      getUpcomingInvoiceQueryKey({ path }),
      listVouchersQueryKey(),
      getVoucherQueryKey({ path: { voucherId: 'v-1' } }),
      listVoucherRedemptionsQueryKey({ path: { voucherId: 'v-1' } }),
    ];
    const untouched = [
      listInstanceVouchersQueryKey({ path: otherPath }),
      getEntitlementsUsageMetricsQueryKey({ path: otherPath }),
      getUpcomingInvoiceQueryKey({ path: otherPath }),
      // Invoices already issued keep what they billed.
      instanceCardInvoices,
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateInstanceVoucherQueries(client, 'initech-prod', 'v-1');

    for (const key of touched) {
      expect(invalidated(client, key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key)).toBe(false);
    }
  });
});

describe('invalidateBillingProviderQueries', () => {
  it('refreshes who can collect, how billing is doing, the defaults and the settings of the connector', async () => {
    const client = new QueryClient();
    const stripe = getConnectorSettingsQueryKey({
      path: { connectorName: 'kaiten.integration.billing.stripe' },
    });
    const touched = [
      getBillingCapabilitiesQueryKey(),
      getBillingHealthQueryKey(),
      getBillingSettingsQueryKey(),
      stripe,
    ];
    // The settings of another connector are not Stripe's to refresh.
    const untouched = [
      getConnectorSettingsQueryKey({
        path: { connectorName: 'kaiten.integration.crm.attio' },
      }),
      organizationInvoices,
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateBillingProviderQueries(client);

    for (const key of touched) {
      expect(invalidated(client, key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key)).toBe(false);
    }
  });
});

describe('invalidateCustomerBillingQueries', () => {
  it('refreshes what a customer has in the provider, and only that customer', async () => {
    const client = new QueryClient();
    const touched = getCustomerBillingQueryKey({
      path: { customerSlug: 'initech' },
    });
    const untouched = getCustomerBillingQueryKey({
      path: { customerSlug: 'globex' },
    });
    seed(client, [touched, untouched]);

    await invalidateCustomerBillingQueries(client, 'initech');

    expect(invalidated(client, touched)).toBe(true);
    expect(invalidated(client, untouched)).toBe(false);
  });
});

describe('the health of billing', () => {
  it('is refreshed by every change to an invoice, since its counts are made of invoices', async () => {
    const client = new QueryClient();
    seed(client, [getBillingHealthQueryKey()]);

    await invalidateInvoiceQueries(client, 'inv-1');

    expect(invalidated(client, getBillingHealthQueryKey())).toBe(true);
  });
});

describe('invalidateProviderSyncQueries', () => {
  it('refreshes what the provider may have changed, for every instance and customer', async () => {
    const client = new QueryClient();
    const touched = [
      organizationInvoices,
      customerInvoices,
      instanceCardInvoices,
      otherInstanceCardInvoices,
      waitingQueue,
      getBillingHealthQueryKey(),
      getInvoiceQueryKey({ path: { invoiceId: 'inv-1' } }),
      getInvoiceQueryKey({ path: { invoiceId: 'inv-2' } }),
      // An invoice paid in the provider ends the late payment of its subscription.
      getInstanceBillingQueryKey({ path }),
      getInstanceBillingQueryKey({ path: otherPath }),
      getCustomerBillingQueryKey({ path: { customerSlug: 'initech' } }),
      getCustomerBillingQueryKey({ path: { customerSlug: 'globex' } }),
    ];
    // The pass changes neither who can collect, nor the defaults, nor the catalogue.
    const untouched = [
      getBillingCapabilitiesQueryKey(),
      getBillingSettingsQueryKey(),
      listVouchersQueryKey(),
    ];
    seed(client, [...touched, ...untouched]);

    await invalidateProviderSyncQueries(client);

    for (const key of touched) {
      expect(invalidated(client, key)).toBe(true);
    }
    for (const key of untouched) {
      expect(invalidated(client, key)).toBe(false);
    }
  });
});
