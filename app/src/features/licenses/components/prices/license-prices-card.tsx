import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import { getPreviewBases } from '../../utils/license-price-preview.utils';
import { LicensePricesActions } from './license-prices-actions';
import { PriceCopyBanner } from './price-copy-banner';
import { PriceStateNote } from './price-state-note';
import { PriceSummary } from './price-summary';
import { PriceTable } from './price-table';

const PriceIcon = dataModelIcons.price;

type LicensePricesCardProps = {
  /** The version whose prices were being copied to this one, when a copy stopped. */
  copyFrom?: string;
  licenseSlug: string;
  /** Called once a copy that stopped is finished. */
  onCopyDone: () => void;
  onDeprecate: (price: Price) => void;
  onPreview: () => void;
  pricing: ReturnType<typeof useLicensePricing>;
};

/**
 * What the Prices tab shows of a version: what it bills, as a line a person
 * reads and as the table of its prices, what its state means for them (with the
 * way to a new version, where they can no longer be changed), the copy that
 * stopped when there is one, and what can be done to the prices as a whole.
 */
export function LicensePricesCard({
  copyFrom,
  licenseSlug,
  onCopyDone,
  onDeprecate,
  onPreview,
  pricing,
}: LicensePricesCardProps) {
  const { t } = useTranslation();
  const { entitlementBySlug, grantBySlug, prices, rules } = pricing;

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <PriceIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Licenses.Prices.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Licenses.Prices.tabDescription')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        <LicensePricesActions
          canPreview={getPreviewBases(prices).length > 0}
          licenseSlug={licenseSlug}
          onPreview={onPreview}
          rules={rules}
        />
      </TableCard.Header>
      <TableCard.Toolbar className="md:flex-col md:items-stretch">
        {copyFrom ? (
          <PriceCopyBanner
            copyFrom={copyFrom}
            entitlementBySlug={entitlementBySlug}
            licenseSlug={licenseSlug}
            onDone={onCopyDone}
            prices={prices}
          />
        ) : null}
        <PriceSummary
          className="text-sm font-medium"
          entitlementBySlug={entitlementBySlug}
          prices={prices}
        />
        <PriceStateNote licenseSlug={licenseSlug} state={rules.state} />
      </TableCard.Toolbar>
      <TableCard.Content>
        <PriceTable
          entitlementBySlug={entitlementBySlug}
          grantBySlug={grantBySlug}
          licenseSlug={licenseSlug}
          onDeprecate={onDeprecate}
          prices={prices}
          rules={rules}
        />
      </TableCard.Content>
    </TableCard>
  );
}
