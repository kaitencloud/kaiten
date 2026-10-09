import { Link } from '@tanstack/react-router';
import { Ban, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import {
  canDeprecatePrice,
  canEditPrice,
  type PriceRules,
} from '../../utils/license-price.utils';

type PriceRowActionsProps = {
  /** What the price is called on screen, for the name of its buttons. */
  label: string;
  licenseSlug: string;
  onDeprecate: (price: Price) => void;
  price: Price;
  rules: PriceRules;
};

/**
 * What can be done to one price. A draft's active price is edited; a published
 * version's is not, since its prices are immutable, and the one change left to
 * it is deprecation, which any active price offers. An action the session's
 * scopes do not cover is not there, and a row with nothing to offer shows none.
 */
export function PriceRowActions({
  label,
  licenseSlug,
  onDeprecate,
  price,
  rules,
}: PriceRowActionsProps) {
  const { t } = useTranslation();
  const mayUpdate = useCanPerform('licensePrices.update');
  const mayDeprecate = useCanPerform('licensePrices.deprecate');
  const edit = mayUpdate && canEditPrice(rules, price);
  const deprecate = mayDeprecate && canDeprecatePrice(price);

  return (
    <div className="flex h-8 items-center justify-end gap-1" data-row-actions>
      {edit ? (
        <Button
          aria-label={t('Pages.Licenses.Prices.Actions.editAria', { label })}
          className="gap-1"
          nativeButton={false}
          render={
            <Link
              params={{ licenseSlug }}
              search={{ price: price.id }}
              to="/catalog/licenses/$licenseSlug/prices"
            >
              <Pencil className="size-3" />
              {t('Pages.Licenses.Prices.Actions.edit')}
            </Link>
          }
          role="link"
          size="sm"
          variant="ghost"
        />
      ) : null}
      {deprecate ? (
        <Button
          aria-label={t('Pages.Licenses.Prices.Actions.deprecateAria', {
            label,
          })}
          className="gap-1"
          onClick={() => onDeprecate(price)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Ban className="size-3" />
          {t('Pages.Licenses.Prices.Actions.deprecate')}
        </Button>
      ) : null}
    </div>
  );
}
