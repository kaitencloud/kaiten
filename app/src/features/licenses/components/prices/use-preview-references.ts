import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Price, Problem } from '@/api-client';
import {
  addonPricesQueryOptions,
  addonVersionsQueryOptions,
  describeMeter,
  getAddonTitle,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import { previewInstancesQueryOptions } from '../../queries';
import { getPreviewMeters } from '../../utils/license-price-preview.utils';
import type { PreviewSampleField } from './preview-fields';

/** One thing the dialog lets a person choose, as a picker lists it. */
export type PreviewChoice = { label: string; value: string };

// The prices read for the add-ons in the list, in the order of the list. The function is
// the same from one render to the next and the TanStack Query shares what did not change,
// so that what is worked out from them is worked out when a price is read and not before.
const pricesRead = (results: UseQueryResult<Price[], Problem>[]) =>
  results.map((result) => result.data);

/**
 * What the dialog reads beyond the version it previews, for what it lets a person price in:
 * the instances whose usage can be rated, the add-ons that can be added, and the meters
 * of the add-ons that were added, which a sample can be given for. Each is read only for a
 * session that may and a release that ships it, and none is retried: a refusal is shown by
 * the picker it leaves short, with a way to ask again. A code for a voucher is typed and
 * checked by the API alone, so the field of it is there when the release ships vouchers.
 */
export function usePreviewReferences(
  pricing: ReturnType<typeof useLicensePricing>,
  addOnSlugs: readonly string[],
) {
  const { i18n, t } = useTranslation();
  const billing = useBillingCapabilities();
  const mayReadAddons = useCanPerform('addons.read');
  const mayListInstances = useCanPerform('instances.list');
  const offersAddons = billing.has('addons') && mayReadAddons;
  const offersVouchers = billing.has('vouchers');

  const addons = useQuery({
    ...addonVersionsQueryOptions(),
    enabled: offersAddons,
  });
  const instances = useQuery({
    ...previewInstancesQueryOptions(),
    enabled: mayListInstances,
  });
  // A row not yet given a version has no prices to read, and one version twice is read once.
  const chosenSlugs = useMemo(
    () => [...new Set(addOnSlugs.filter((slug) => slug !== ''))],
    [addOnSlugs],
  );
  const addonPrices = useQueries({
    queries: chosenSlugs.map((slug) => ({
      ...addonPricesQueryOptions(slug),
      enabled: offersAddons,
    })),
    combine: pricesRead,
  });

  const addonChoices = useMemo<PreviewChoice[]>(
    () =>
      (addons.data?.items ?? []).map((addon) => ({
        label: getAddonTitle(addon),
        value: addon.slug,
      })),
    [addons.data],
  );
  const instanceChoices = useMemo<PreviewChoice[]>(
    () =>
      (instances.data?.items ?? []).flatMap((instance) =>
        instance.slug
          ? [
              {
                label: `${instance.name} (${instance.slug})`,
                value: instance.slug,
              },
            ]
          : [],
      ),
    [instances.data],
  );

  // A sample for what the add-ons in the list meter, once their prices are read. The
  // entitlement the version already meters is not offered twice.
  const { entitlementBySlug, prices } = pricing;
  const addonSamples = useMemo<PreviewSampleField[]>(() => {
    const offered = new Set(
      getPreviewMeters(prices).map(({ entitlementSlug }) => entitlementSlug),
    );
    const fields: PreviewSampleField[] = [];
    for (const list of addonPrices) {
      for (const { entitlementSlug, price } of getPreviewMeters(list ?? [])) {
        if (offered.has(entitlementSlug)) {
          continue;
        }
        offered.add(entitlementSlug);
        const entitlement = entitlementBySlug.get(entitlementSlug);
        fields.push({
          // What an add-on meters is bound by what the instance holds with it.
          description: describeMeter(
            price,
            entitlement,
            undefined,
            t,
            i18n.language,
            'instance',
          ),
          entitlementSlug,
          label: entitlement?.name ?? entitlementSlug,
        });
      }
    }

    return fields;
  }, [addonPrices, entitlementBySlug, i18n.language, prices, t]);

  return {
    addonChoices,
    addons,
    addonSamples,
    instanceChoices,
    instances,
    offersAddons,
    offersInstances: mayListInstances,
    offersVouchers,
  };
}
