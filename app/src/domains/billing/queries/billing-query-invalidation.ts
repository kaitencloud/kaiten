import type { QueryClient } from '@tanstack/react-query';
import {
  getBillingCapabilitiesQueryKey,
  getBillingHealthQueryKey,
  getBillingSettingsQueryKey,
  getConnectorSettingsQueryKey,
  getCustomerBillingQueryKey,
  getEntitlementsUsageMetricsQueryKey,
  getInstanceBillingQueryKey,
  getInvoiceQueryKey,
  getLicenseQueryKey,
  getUpcomingInvoiceQueryKey,
  getVoucherQueryKey,
  listHandoffQueryKey,
  listInstanceAddonsQueryKey,
  listInstanceInvoicesQueryKey,
  listInstanceVouchersQueryKey,
  listInvoicesQueryKey,
  listLicensePricesQueryKey,
  listVoucherRedemptionsQueryKey,
  listVouchersQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateInstanceQueries } from '@/domains/customer-management';
import { STRIPE_CONNECTOR_NAME } from '../logic/billing-providers';
import { instancesBillingBaseQueryKey } from './instances-billing-query-options';
import { licensesWithPricesBaseQueryKey } from './licenses-prices-query-options';

/**
 * What a billing mutation refreshes. Billing data is read in several places (an
 * invoice is on its page, in the organization's list, in its instance's list and
 * in the handoff queue), so a mutation calls the helper of the thing it changed
 * and every screen that shows it follows. They use the generated keys, which
 * match by prefix: `listInvoicesQueryKey()` reaches the list of invoices under any
 * scope, since every list is read whole under the key of its operation with what
 * narrows it in the key.
 */

/**
 * An instance's subscription changed (subscribed, cancelled, reactivated, moved
 * to another plan, its terms or provider changed): its subscription, its upcoming
 * invoice, its invoices and the organization's list, the add-ons it holds, the
 * effective usage its entitlements show, the Billing column of the lists of
 * instances (one read for every instance, so every instance's), and the instance
 * itself, whose customer and license are frozen while the subscription lives.
 */
export async function invalidateInstanceBillingQueries(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  const path = { instanceSlug };

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: getInstanceBillingQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getUpcomingInvoiceQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: listInstanceInvoicesQueryKey({ path }),
    }),
    queryClient.invalidateQueries({ queryKey: listInvoicesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: instancesBillingBaseQueryKey }),
    queryClient.invalidateQueries({
      queryKey: listInstanceAddonsQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getEntitlementsUsageMetricsQueryKey({ path }),
    }),
    // A subscribe takes a voucher code: the instance redeemed it, and its voucher
    // counted the redemption. The response does not say which voucher the code was
    // of, so the page and the redemptions of every voucher are read again.
    invalidateInstanceVoucherQueries(queryClient, instanceSlug),
    invalidateEveryVoucherPage(queryClient),
    invalidateInstanceQueries(queryClient, instanceSlug),
  ]);
}

/**
 * The vouchers changed (made, edited, published, archived, redeemed, revoked): the
 * list, and the page of one voucher with its redemptions when `voucherId` is given.
 * The three match by prefix, so that a list read under any filter is reached.
 */
export async function invalidateVoucherQueries(
  queryClient: QueryClient,
  voucherId?: string,
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: listVouchersQueryKey() }),
  ];

  if (voucherId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getVoucherQueryKey({ path: { voucherId } }),
      }),
      queryClient.invalidateQueries({
        queryKey: listVoucherRedemptionsQueryKey({ path: { voucherId } }),
      }),
    );
  }

  await Promise.all(invalidations);
}

/**
 * The page and the redemptions of every voucher, for a change that reached one of
 * them without saying which. Each operation is named by its generated key, with no
 * voucher in it, so that the vouchers read so far are marked, and only the ones on
 * screen are asked again.
 */
async function invalidateEveryVoucherPage(queryClient: QueryClient) {
  const [{ _id: voucherId }] = getVoucherQueryKey({ path: { voucherId: '' } });
  const [{ _id: redemptionsId }] = listVoucherRedemptionsQueryKey({
    path: { voucherId: '' },
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [{ _id: voucherId }] }),
    queryClient.invalidateQueries({ queryKey: [{ _id: redemptionsId }] }),
  ]);
}

/**
 * An instance redeemed a voucher or had a redemption revoked: what it redeemed, the
 * effective values its entitlements show, since a boost applies at once, and the
 * invoice its next boundary will issue, which a discount reaches. The voucher counted
 * the redemption (or keeps counting it), and its redemptions list the instance, so its
 * page is read again when it is named.
 */
export async function invalidateInstanceVoucherQueries(
  queryClient: QueryClient,
  instanceSlug: string,
  voucherId?: string,
) {
  const path = { instanceSlug };

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listInstanceVouchersQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getEntitlementsUsageMetricsQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getUpcomingInvoiceQueryKey({ path }),
    }),
    invalidateVoucherQueries(queryClient, voucherId),
  ]);
}

/**
 * The add-ons an instance holds changed (attached, taken off, held in another
 * quantity): its add-ons, the effective values its entitlements show, since an
 * attachment applies at once, and the invoice its next boundary will issue, which
 * bills the quantity held then. Invoices already issued keep what they billed.
 */
export async function invalidateInstanceAddonQueries(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  const path = { instanceSlug };

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listInstanceAddonsQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getEntitlementsUsageMetricsQueryKey({ path }),
    }),
    queryClient.invalidateQueries({
      queryKey: getUpcomingInvoiceQueryKey({ path }),
    }),
  ]);
}

/**
 * An invoice changed (paid, written off, voided, recomposed, released from its
 * hold, acknowledged, pushed again, read back from its provider): its page when
 * `invoiceId` is given, the organization's list, the handoff queue, the lists of
 * every instance, since a recompose replaces an invoice by another, the health
 * of billing, whose counts (held, overdue, failed pushes, waiting for the
 * accounting system) are made of invoices, and the Billing column of the lists of
 * instances: a subscription leaves PAST_DUE once nothing of it is overdue, which
 * settling, voiding or writing off its last overdue invoice brings about.
 */
export async function invalidateInvoiceQueries(
  queryClient: QueryClient,
  invoiceId?: string,
) {
  // Every instance's list: the operation is named by its generated key, with no
  // instance in it.
  const [{ _id: instanceInvoicesId }] = listInstanceInvoicesQueryKey({
    path: { instanceSlug: '' },
  });
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: listInvoicesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: listHandoffQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: [{ _id: instanceInvoicesId }],
    }),
    queryClient.invalidateQueries({ queryKey: getBillingHealthQueryKey() }),
    queryClient.invalidateQueries({ queryKey: instancesBillingBaseQueryKey }),
  ];

  if (invoiceId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getInvoiceQueryKey({ path: { invoiceId } }),
      }),
    );
  }

  await Promise.all(invalidations);
}

/**
 * A price of a license version changed (created, edited, deprecated): that
 * version's prices, and the version, whose detail carries what the page reads, and
 * the license versions with their prices, where the list of licenses and the plans
 * of a subscription read them (one read for every version, so every version's).
 */
export async function invalidateLicensePriceQueries(
  queryClient: QueryClient,
  licenseSlug: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listLicensePricesQueryKey({ path: { licenseSlug } }),
    }),
    queryClient.invalidateQueries({
      queryKey: getLicenseQueryKey({ path: { licenseSlug } }),
    }),
    queryClient.invalidateQueries({ queryKey: licensesWithPricesBaseQueryKey }),
  ]);
}

/**
 * The organization's billing settings changed: the settings, and the
 * capabilities, which carry the providers and the retention the settings screen
 * shows.
 */
export async function invalidateBillingSettingsQueries(
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getBillingSettingsQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: getBillingCapabilitiesQueryKey(),
    }),
  ]);
}

/**
 * A payment provider was connected, reconfigured or disconnected: the capabilities,
 * which say who can collect invoices and whether Stripe is connected, the health
 * of billing, which reads the provider's sync, the defaults of a subscription, whose
 * collection method depends on the provider, and the connector's own settings.
 */
export async function invalidateBillingProviderQueries(
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: getBillingCapabilitiesQueryKey(),
    }),
    queryClient.invalidateQueries({ queryKey: getBillingHealthQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getBillingSettingsQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: getConnectorSettingsQueryKey({
        path: { connectorName: STRIPE_CONNECTOR_NAME },
      }),
    }),
  ]);
}

/**
 * What a customer has in the payment provider changed (a payment method saved,
 * replaced or removed): its billing read, which the card of the payment method
 * and the dialog that moves a subscription to automatic collection both show.
 */
export async function invalidateCustomerBillingQueries(
  queryClient: QueryClient,
  customerSlug: string,
) {
  await queryClient.invalidateQueries({
    queryKey: getCustomerBillingQueryKey({ path: { customerSlug } }),
  });
}

/**
 * The payment provider was read for what changed on its side (a pass of the
 * provider): the invoices and the health, which count them, every invoice page that
 * was read, the subscriptions of every instance, since an invoice paid there ends a
 * late payment, and what every customer holds in the provider, whose payment method
 * may have changed. Each operation is named by its generated key, with nobody in it,
 * so that what was read so far is marked and only what is on screen is asked again.
 */
export async function invalidateProviderSyncQueries(queryClient: QueryClient) {
  const [{ _id: invoiceId }] = getInvoiceQueryKey({ path: { invoiceId: '' } });
  const [{ _id: subscriptionId }] = getInstanceBillingQueryKey({
    path: { instanceSlug: '' },
  });
  const [{ _id: customerBillingId }] = getCustomerBillingQueryKey({
    path: { customerSlug: '' },
  });

  await Promise.all([
    invalidateInvoiceQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: [{ _id: invoiceId }] }),
    queryClient.invalidateQueries({ queryKey: [{ _id: subscriptionId }] }),
    queryClient.invalidateQueries({ queryKey: [{ _id: customerBillingId }] }),
  ]);
}
