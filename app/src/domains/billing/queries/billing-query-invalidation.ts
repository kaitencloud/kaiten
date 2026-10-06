import type { QueryClient } from '@tanstack/react-query';
import {
  getBillingCapabilitiesQueryKey,
  getBillingSettingsQueryKey,
  getEntitlementsUsageMetricsQueryKey,
  getInstanceBillingQueryKey,
  getInvoiceQueryKey,
  getLicenseQueryKey,
  getUpcomingInvoiceQueryKey,
  listHandoffQueryKey,
  listInstanceInvoicesQueryKey,
  listInvoicesQueryKey,
  listLicensePricesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateInstanceQueries } from '@/domains/customer-management';

/**
 * What a billing mutation refreshes. Billing data is read in several places (an
 * invoice is on its page, in the organization's list, in its instance's list and
 * in the handoff queue), so a mutation calls the helper of the thing it changed
 * and every screen that shows it follows. They use the generated keys, which
 * match by prefix: `listInvoicesQueryKey()` reaches a list under any filter and
 * its infinite form.
 */

/**
 * An instance's subscription changed (subscribed, cancelled, reactivated, its
 * terms or provider changed): its subscription, its upcoming invoice, its
 * invoices and the organization's list, the effective usage its entitlements
 * show, and the instance itself, whose customer and license are frozen while the
 * subscription lives.
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
    queryClient.invalidateQueries({
      queryKey: getEntitlementsUsageMetricsQueryKey({ path }),
    }),
    invalidateInstanceQueries(queryClient, instanceSlug),
  ]);
}

/**
 * An invoice changed (paid, written off, voided, recomposed, released from its
 * hold, acknowledged): its page when `invoiceId` is given, the organization's
 * list, the handoff queue, and the lists of every instance, since a recompose
 * replaces an invoice by another.
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
 * version's prices, and the version, whose detail carries what the page reads.
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
