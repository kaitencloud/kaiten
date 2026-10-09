import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getPriceLabel, useCanPerform } from '@/domains/billing';
import { getPriceDeprecation } from '../../utils/addon-price.utils';

type AddonPriceRowActionsProps = {
  onDeprecate: (price: Price) => void;
  price: Price;
};

/**
 * What can be done to one price: deprecate it, and nothing else, since a price is never
 * edited. The default price of a period cannot be deprecated -- it is what bills every
 * instance holding the version -- so the button stays, disabled, with the way out on
 * hover and on focus: a new price made the default of the period, or a new version.
 * A deprecated price has nothing to offer, and neither does a session that may not
 * write add-ons.
 */
export function AddonPriceRowActions({
  onDeprecate,
  price,
}: AddonPriceRowActionsProps) {
  const { t } = useTranslation();
  const mayDeprecate = useCanPerform('addonPrices.deprecate');
  const deprecation = getPriceDeprecation(price);
  const label = getPriceLabel(price, undefined, t);

  if (!mayDeprecate || !deprecation) {
    return null;
  }
  const button = (
    <Button
      aria-label={t('Pages.Addons.Prices.Actions.deprecateAria', { label })}
      className="gap-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      disabled={!deprecation.allowed}
      focusableWhenDisabled
      onClick={() => onDeprecate(price)}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Ban className="size-3" />
      {t('Pages.Addons.Prices.Actions.deprecate')}
    </Button>
  );

  return (
    <div className="flex h-8 items-center justify-end gap-1" data-row-actions>
      {deprecation.allowed ? (
        button
      ) : (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>
            {t('Pages.Addons.Prices.Actions.deprecateDefaultHint')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
