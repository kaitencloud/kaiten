import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, License } from '@/api-client';
import { addonVersionsQueryOptions, useCanPerform } from '@/domains/billing';
import {
  voucherCustomersQueryOptions,
  voucherEntitlementsQueryOptions,
  voucherLicensesQueryOptions,
} from '../queries';
import { buildVoucherNames } from '../utils/voucher-references';
import { useVoucherPrices } from './use-voucher-prices';

const NO_ADDONS: readonly Addon[] = [];
const NO_LICENSES: readonly License[] = [];

/**
 * What a voucher refers to, read for the screens that name it or let it be chosen: the
 * customers it can be reserved for, the license versions and the add-ons it can be
 * limited to, and the entitlements a boost changes. Each is asked only of a session whose
 * scopes read it, and none is retried: a refusal is shown by the picker it leaves
 * short, with a way to ask again. The wizard's route starts these reads in its loader
 * (`loadVoucherWizard`), so its pickers are usually full when a step draws them: it
 * says so with `startedByLoader`, and a read the loader met a refusal on is then shown
 * as it is rather than asked once more behind it. A screen whose loader started
 * nothing, such as the voucher page, asks again when it mounts on a failed read.
 *
 * The prices come with the versions they belong to, one read for each, so they are only
 * read when the screen needs them (`withPrices`): to choose among them, or to name those
 * a voucher is limited to. `names` writes out the ids and the slugs a voucher holds.
 */
export function useVoucherReferences({
  startedByLoader = false,
  withPrices = false,
}: { startedByLoader?: boolean; withPrices?: boolean } = {}) {
  const { t } = useTranslation();
  const mayListCustomers = useCanPerform('customers.list');
  const mayListLicenses = useCanPerform('licenses.list');
  const mayReadAddons = useCanPerform('addons.read');
  const mayListEntitlements = useCanPerform('entitlements.list');
  const retryOnMount = !startedByLoader;
  const customers = useQuery({
    ...voucherCustomersQueryOptions(),
    enabled: mayListCustomers,
    retryOnMount,
  });
  const licenses = useQuery({
    ...voucherLicensesQueryOptions(),
    enabled: mayListLicenses,
    retryOnMount,
  });
  const addons = useQuery({
    ...addonVersionsQueryOptions(),
    enabled: mayReadAddons,
    retryOnMount,
  });
  const entitlements = useQuery({
    ...voucherEntitlementsQueryOptions(),
    enabled: mayListEntitlements,
    retryOnMount,
  });
  const prices = useVoucherPrices({
    addons: addons.data?.items ?? NO_ADDONS,
    enabled: withPrices,
    licenses: licenses.data?.items ?? NO_LICENSES,
  });
  const names = useMemo(
    () =>
      buildVoucherNames({
        addons: addons.data?.items,
        customers: customers.data?.items,
        entitlements: entitlements.data?.items,
        licenses: licenses.data?.items,
        prices: prices.names,
        t,
      }),
    [
      addons.data,
      customers.data,
      entitlements.data,
      licenses.data,
      prices.names,
      t,
    ],
  );

  return { addons, customers, entitlements, licenses, names, prices };
}

export type VoucherReferences = ReturnType<typeof useVoucherReferences>;
