import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { AddonPricing } from '../../hooks';
import { VersionStateNote } from '../version-state-note';
import { AddonPriceTable } from './addon-price-table';
import { PeriodSlots } from './period-slots';

const PriceIcon = dataModelIcons.price;

type AddonPricesCardProps = {
  onDeprecate: (price: Price) => void;
  pricing: AddonPricing;
};

/**
 * What the Prices tab shows of a version: the slot of each billing period, which says
 * which prices bill what, what the state of the version means for changing them -- with
 * the way to a new version where it has been on sale -- and the table of its flat fees.
 * Adding one is the action of the header, for a session that may write add-ons, while
 * the version takes a price. The metered prices the API takes and never values are not
 * listed, and a line says how many there are.
 */
export function AddonPricesCard({
  onDeprecate,
  pricing,
}: AddonPricesCardProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('addonPrices.create');
  const { addon, canAdd, flatFees, slots, unvaluedCount } = pricing;

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <PriceIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Addons.Prices.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Addons.Prices.tabDescription')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        {mayCreate && canAdd ? (
          <TableCard.HeaderActions>
            <Button
              nativeButton={false}
              render={
                <Link
                  params={{ addonSlug: addon.slug }}
                  search={{ price: 'new' }}
                  to="/addons/$addonSlug/prices"
                >
                  <Plus className="size-4" />
                  {t('Pages.Addons.Prices.Actions.add')}
                </Link>
              }
              role="link"
              size="sm"
            />
          </TableCard.HeaderActions>
        ) : null}
      </TableCard.Header>
      <TableCard.Toolbar className="md:flex-col md:items-stretch">
        <PeriodSlots slots={slots} />
        <VersionStateNote
          addon={addon}
          messages={{
            ARCHIVED: t('Pages.Addons.Prices.Notes.ARCHIVED'),
            DRAFT: t('Pages.Addons.Prices.Notes.DRAFT'),
            PUBLISHED: t('Pages.Addons.Prices.Notes.PUBLISHED'),
          }}
        />
      </TableCard.Toolbar>
      <TableCard.Content>
        <AddonPriceTable onDeprecate={onDeprecate} prices={flatFees} />
      </TableCard.Content>
      {unvaluedCount > 0 ? (
        <p
          className="px-6 text-sm text-muted-foreground"
          data-testid="unvalued-prices"
        >
          {t('Pages.Addons.Prices.unvalued', { count: unvaluedCount })}
        </p>
      ) : null}
    </TableCard>
  );
}
