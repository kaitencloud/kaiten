import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';

type InvoicesEmptyProps = {
  /** Whether a filter of the screen is why there is no row. */
  filtered: boolean;
  /** Takes every filter of the screen off. */
  onClearFilters: () => void;
  /** Takes the scope of the URL off: the list of every invoice. */
  onClearScope: () => void;
  scope: InvoiceScope;
};

/**
 * What the table says when it has no row, in its own cell like the other lists. A
 * filter that hides everything says so and clears itself from the message; a
 * customer or an instance that was never invoiced says whose it is and leads to
 * every invoice; an organization with none yet says where an invoice comes from.
 */
export function InvoicesEmpty({
  filtered,
  onClearFilters,
  onClearScope,
  scope,
}: InvoicesEmptyProps) {
  const { t } = useTranslation();

  function renderMessage() {
    if (filtered) {
      return {
        action: (
          <Button onClick={onClearFilters} size="sm" variant="outline">
            {t('Pages.Billing.Invoices.Filters.clear')}
          </Button>
        ),
        description: t('Pages.Billing.Invoices.Empty.filteredDescription'),
        title: t('Pages.Billing.Invoices.Empty.filteredTitle'),
      };
    }
    if (scope.customerSlug || scope.instanceSlug) {
      return {
        action: (
          <Button onClick={onClearScope} size="sm" variant="outline">
            {t('Pages.Billing.Invoices.Empty.showAll')}
          </Button>
        ),
        description: t('Pages.Billing.Invoices.Empty.scopedDescription'),
        title: t(
          scope.instanceSlug
            ? 'Pages.Billing.Invoices.Empty.scopedInstanceTitle'
            : 'Pages.Billing.Invoices.Empty.scopedCustomerTitle',
        ),
      };
    }

    return {
      action: (
        <Button
          nativeButton={false}
          render={
            <Link to="/customers/instances">
              {t('Pages.Billing.Invoices.Empty.instances')}
            </Link>
          }
          role="link"
          size="sm"
          variant="outline"
        />
      ),
      description: t('Pages.Billing.Invoices.Empty.description'),
      title: t('Pages.Billing.Invoices.Empty.title'),
    };
  }

  const { action, description, title } = renderMessage();

  return (
    <div
      className="flex flex-col items-center gap-2 py-6"
      data-testid="invoices-empty"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm">{description}</p>
      {action}
    </div>
  );
}
