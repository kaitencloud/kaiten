import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useLicensePricing } from '../../hooks/use-license-pricing';
import { PriceSummary } from './price-summary';
import { PriceTable } from './price-table';

const PriceIcon = dataModelIcons.price;

type LicensePricesTabProps = {
  licenseSlug: string;
};

// What the state of the version says about its prices, so that a price that
// cannot be edited is never a surprise.
const STATE_NOTE_KEYS = {
  ARCHIVED: 'Pages.Licenses.Prices.Notes.archived',
  DRAFT: 'Pages.Licenses.Prices.Notes.draft',
  PUBLISHED: 'Pages.Licenses.Prices.Notes.published',
} as const;

/**
 * The prices of one license version: what it bills, as a line a person reads
 * and as the table of its prices. Each price is one billable concern and becomes
 * one line of an invoice.
 */
export function LicensePricesTab({ licenseSlug }: LicensePricesTabProps) {
  const { t } = useTranslation();
  const { entitlementBySlug, grantBySlug, prices, rules } =
    useLicensePricing(licenseSlug);

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
      </TableCard.Header>
      <div className="space-y-3 px-6 pb-3">
        <PriceSummary
          className="text-sm font-medium"
          entitlementBySlug={entitlementBySlug}
          prices={prices}
        />
        <Alert>
          <Lock />
          <AlertDescription>{t(STATE_NOTE_KEYS[rules.state])}</AlertDescription>
        </Alert>
      </div>
      <TableCard.Content>
        <PriceTable
          entitlementBySlug={entitlementBySlug}
          grantBySlug={grantBySlug}
          prices={prices}
        />
      </TableCard.Content>
    </TableCard>
  );
}
