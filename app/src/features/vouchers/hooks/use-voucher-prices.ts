import { type UseQueryResult, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, License, Price } from '@/api-client';
import { listLicensePricesOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  addonPricesQueryOptions,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
} from '@/domains/billing';
import type { PriceOption } from '../types';
import { getAddonLabel, getLicenseLabel } from '../utils/voucher-references';

type Owner =
  | { kind: 'ADDON'; version: Addon }
  | { kind: 'LICENSE'; version: License };

const combineReads = (results: UseQueryResult<Price[], unknown>[]) => ({
  firstError: results.find((result) => result.isError)?.error ?? null,
  isPending: results.some(
    (result) => result.isPending && result.fetchStatus !== 'idle',
  ),
  prices: results.map((result) => result.data),
  refetch: () => {
    for (const result of results) {
      if (result.isError) {
        void result.refetch();
      }
    }
  },
});

/**
 * The prices a voucher can be limited to. The API gives a price no owner and lists them
 * by the version they belong to, so the console asks every license version and every
 * add-on version for its own, and writes each price with the version it is of. It reads
 * them only when asked to (`enabled`): a voucher that discounts the base price or the
 * add-ons as a whole needs none. A price a version no longer offers is listed and says so,
 * since a subscription may still be billed by it.
 */
export function useVoucherPrices({
  addons,
  enabled,
  licenses,
}: {
  addons: readonly Addon[];
  enabled: boolean;
  licenses: readonly License[];
}) {
  const { i18n, t } = useTranslation();
  const owners = useMemo<Owner[]>(
    () => [
      ...licenses.map((version) => ({ kind: 'LICENSE' as const, version })),
      ...addons.map((version) => ({ kind: 'ADDON' as const, version })),
    ],
    [addons, licenses],
  );
  const reads = useQueries({
    combine: combineReads,
    queries: owners.map((owner) =>
      owner.kind === 'LICENSE'
        ? {
            ...listLicensePricesOptions({
              path: { licenseSlug: owner.version.slug ?? owner.version.id },
            }),
            enabled,
            retry: false,
          }
        : { ...addonPricesQueryOptions(owner.version.slug), enabled },
    ),
  });

  const options = useMemo<PriceOption[]>(
    () =>
      owners.flatMap((owner, index) =>
        (reads.prices[index] ?? []).map((price) => ({
          amount: joinPriceAmount(
            getPriceAmountParts(price, undefined, t, i18n.language),
          ),
          deprecated: price.status === 'DEPRECATED',
          id: price.id,
          label: getPriceLabel(price, undefined, t),
          owner:
            owner.kind === 'LICENSE'
              ? getLicenseLabel(owner.version, t)
              : getAddonLabel(owner.version, t),
          ownerKind: owner.kind,
        })),
      ),
    [i18n.language, owners, reads.prices, t],
  );
  const names = useMemo(
    () =>
      Object.fromEntries(
        options.map((option) => [
          option.id,
          `${option.owner} · ${option.label}`,
        ]),
      ),
    [options],
  );

  return {
    error: reads.firstError,
    isPending: enabled && reads.isPending,
    names,
    options,
    refetch: reads.refetch,
  };
}
