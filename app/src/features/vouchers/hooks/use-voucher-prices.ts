import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  catalogPricesQueryOptions,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
} from '@/domains/billing';
import type { PriceOption } from '../types';
import { getAddonLabel, getLicenseLabel } from '../utils/voucher-references';

/**
 * The prices a voucher can be limited to. The API gives a price no owner and lists them
 * by the version they belong to, so the console reads every license version and every
 * add-on version with its own prices in one document (`catalogPricesQueryOptions`: one
 * request unless a list is longer than a page), and writes each price with the version
 * it is of. It reads them only when asked to (`enabled`): a voucher that discounts the
 * base price or the add-ons as a whole needs none. A price a version no longer offers is
 * listed and says so, since a subscription may still be billed by it.
 *
 * A metered price is written with the entitlement it measures, by its name and its unit,
 * when the console has read the entitlements (`entitlements`): the document carries
 * only its slug, and a session that may not read them sees the slug rather than a
 * guess.
 *
 * The document needs read:licenses and read:addons together, as the API checks the
 * scopes of a whole document at once: a session that holds only one gets the refusal,
 * which the picker shows with a way to ask again.
 */
export function useVoucherPrices({
  enabled,
  entitlements,
}: {
  enabled: boolean;
  entitlements?: readonly Pick<
    Entitlement,
    'name' | 'slug' | 'unitPlural' | 'unitSingular'
  >[];
}) {
  const { i18n, t } = useTranslation();
  const catalog = useQuery({ ...catalogPricesQueryOptions, enabled });
  const entitlementsBySlug = useMemo(
    () =>
      new Map(
        (entitlements ?? []).map((entitlement) => [
          entitlement.slug,
          entitlement,
        ]),
      ),
    [entitlements],
  );

  const options = useMemo<PriceOption[]>(
    () =>
      (catalog.data ?? []).flatMap((version) => {
        const owner =
          version.kind === 'LICENSE'
            ? getLicenseLabel(version, t)
            : getAddonLabel(version, t);

        return version.prices.map((price) => {
          const entitlement = price.metered
            ? entitlementsBySlug.get(price.metered.entitlementSlug)
            : undefined;

          return {
            amount: joinPriceAmount(
              getPriceAmountParts(price, entitlement, t, i18n.language),
            ),
            deprecated: price.status === 'DEPRECATED',
            id: price.id,
            label: getPriceLabel(price, entitlement, t),
            owner,
            ownerKind: version.kind,
          };
        });
      }),
    [catalog.data, entitlementsBySlug, i18n.language, t],
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
    error: catalog.error,
    isPending: enabled && catalog.isPending,
    names,
    options,
    refetch: () => {
      void catalog.refetch();
    },
  };
}
