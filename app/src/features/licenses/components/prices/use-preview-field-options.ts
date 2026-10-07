import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import {
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
} from '../../utils/license-price-display';
import { describeMeter } from '../../utils/license-price-meter';
import {
  getPreviewBases,
  getPreviewMeters,
} from '../../utils/license-price-preview.utils';
import type { PreviewBaseOption, PreviewSampleField } from './preview-fields';

/**
 * What the preview form offers of a version: the flat fees an invoice can start
 * from, as the select lists them, and a sample per entitlement an active metered
 * price rates, with what that price bills against. The meters are what the form
 * starts from.
 */
export function usePreviewFieldOptions(
  pricing: ReturnType<typeof useLicensePricing>,
) {
  const { i18n, t } = useTranslation();
  const { entitlementBySlug, grantBySlug, prices } = pricing;
  const bases = useMemo(() => getPreviewBases(prices), [prices]);
  const meters = useMemo(() => getPreviewMeters(prices), [prices]);

  const baseOptions: PreviewBaseOption[] = bases.map((base) => ({
    id: base.id,
    label: [
      getPriceLabel(base, undefined, t),
      joinPriceAmount(getPriceAmountParts(base, undefined, t, i18n.language)),
      base.isDefault ? t('Pages.Licenses.Prices.defaultBadge') : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
  }));
  const sampleFields: PreviewSampleField[] = meters.map(
    ({ entitlementSlug, price }) => {
      const entitlement = entitlementBySlug.get(entitlementSlug);

      return {
        description: describeMeter(
          price,
          entitlement,
          grantBySlug.get(entitlementSlug),
          t,
          i18n.language,
        ),
        entitlementSlug,
        label: entitlement?.name ?? entitlementSlug,
      };
    },
  );

  return { baseOptions, meters, sampleFields };
}
