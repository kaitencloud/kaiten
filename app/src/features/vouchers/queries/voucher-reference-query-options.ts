import type { QueryClient } from '@tanstack/react-query';
import {
  addonVersionsQueryOptions,
  type BillingAction,
  canPerformAction,
} from '@/domains/billing';
import {
  allCustomersOptions,
  allEntitlementsOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import { grantedScopesQueryOptions } from '@/lib/granted-scopes';

// What a voucher refers to, read for the screens that name it or let it be chosen.
// The wizard's loader warms these under the keys its pickers read, so the options
// are written once, here. None is retried: a refusal is shown by the picker it
// leaves short, with a way to ask again. What a screen does when it mounts on a
// read the loader already refused is the screen's to say (`retryOnMount`, see
// `useVoucherReferences`): the wizard shows the refusal, the other screens ask again.

/** The customers a voucher can be reserved for. */
export const voucherCustomersQueryOptions = () => ({
  ...allCustomersOptions(),
  retry: false,
});

/** The license versions a voucher can be limited to. */
export const voucherLicensesQueryOptions = () => ({
  ...allLicensesOptions(),
  retry: false,
});

/** The entitlements a boost changes. */
export const voucherEntitlementsQueryOptions = () => ({
  ...allEntitlementsOptions(),
  retry: false,
});

/**
 * Starts the reads of what the wizard's pickers show, for the session's scopes: each is
 * asked only of a session whose scopes read it, as the pickers do. A prefetch never
 * throws, so a refusal does not replace the wizard by the error of its route: the
 * picker shows it, with a way to ask again.
 */
export async function warmVoucherReferences(queryClient: QueryClient) {
  await queryClient.prefetchQuery(grantedScopesQueryOptions);
  const scopes =
    queryClient.getQueryData(grantedScopesQueryOptions.queryKey) ?? null;
  const reads: [BillingAction, () => Promise<void>][] = [
    [
      'customers.list',
      () => queryClient.prefetchQuery(voucherCustomersQueryOptions()),
    ],
    [
      'licenses.list',
      () => queryClient.prefetchQuery(voucherLicensesQueryOptions()),
    ],
    [
      'addons.read',
      () => queryClient.prefetchQuery(addonVersionsQueryOptions()),
    ],
    [
      'entitlements.list',
      () => queryClient.prefetchQuery(voucherEntitlementsQueryOptions()),
    ],
  ];

  await Promise.all(
    reads.flatMap(([action, read]) =>
      canPerformAction(scopes, action) ? [read()] : [],
    ),
  );
}
