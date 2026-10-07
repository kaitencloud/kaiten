import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCanPerform } from '@/domains/billing';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { PriceRules } from '../../utils/license-price.utils';

const InvoiceIcon = dataModelIcons.invoice;

type LicensePricesActionsProps = {
  /** Whether the version has a flat fee an invoice can start from. */
  canPreview: boolean;
  licenseSlug: string;
  onPreview: () => void;
  rules: PriceRules;
};

// A button that cannot be used stays in the tab order, and says why on hover and
// on focus, instead of a wrapper that takes the focus for it.
function PreviewAction({
  canPreview,
  onPreview,
}: {
  canPreview: boolean;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const button = (
    <Button
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      disabled={!canPreview}
      focusableWhenDisabled
      onClick={onPreview}
      size="sm"
      type="button"
      variant="outline"
    >
      <InvoiceIcon className="size-4" />
      {t('Pages.Licenses.Prices.Preview.open')}
    </Button>
  );

  return canPreview ? (
    button
  ) : (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        {t('Pages.Licenses.Prices.Preview.unavailable')}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * What the tab offers on the prices as a whole: to preview the invoice they make
 * up, and to add one. An action the session's scopes do not cover is not there,
 * and a version that takes no price has no way to add one. A preview that cannot
 * be run says why, since an invoice always starts from a flat fee.
 */
export function LicensePricesActions({
  canPreview,
  licenseSlug,
  onPreview,
  rules,
}: LicensePricesActionsProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('licensePrices.create');
  const mayPreview = useCanPerform('licensePrices.preview');
  const mayAdd = rules.canAdd && mayCreate;

  if (!mayAdd && !mayPreview) {
    return null;
  }

  return (
    <TableCard.HeaderActions>
      {mayPreview ? (
        <PreviewAction canPreview={canPreview} onPreview={onPreview} />
      ) : null}
      {mayAdd ? (
        <Button
          nativeButton={false}
          render={
            <Link
              params={{ licenseSlug }}
              search={{ price: 'new' }}
              to="/licenses/$licenseSlug/prices"
            >
              <Plus className="size-4" />
              {t('Pages.Licenses.Prices.Actions.add')}
            </Link>
          }
          role="link"
          size="sm"
        />
      ) : null}
    </TableCard.HeaderActions>
  );
}
