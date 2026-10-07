import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StartedSubscription } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  formatBoundary,
  Money,
  ServicePeriod,
  SubscriptionStatusBadge,
  useAlertFocus,
} from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';

type SubscribedStateProps = {
  onClose: () => void;
  started: StartedSubscription;
};

/**
 * What the dialog says once the subscription has started: its status and period,
 * and the invoice of the first period with the way to it, when the price bills in
 * advance. When it bills in arrears nothing is issued yet, and the first invoice
 * is told by its date. The tab behind it already shows the subscription. It takes
 * the focus the button that sent the form had: that button is gone with the form,
 * and the keyboard would land on nothing.
 */
export function SubscribedState({ onClose, started }: SubscribedStateProps) {
  const { i18n, t } = useTranslation();
  const invoice = started.activationInvoice;
  const statusRef = useAlertFocus(true, started);

  return (
    <>
      <StackedFormDialogFooter>
        <Button onClick={onClose} type="button">
          {t('Common.close')}
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel>
        <div
          className="space-y-4 outline-none"
          data-testid="subscribed"
          ref={statusRef}
          role="status"
          tabIndex={-1}
        >
          <div className="flex items-center gap-2">
            <CircleCheck
              aria-hidden
              className="size-5 text-success-subtle-foreground"
            />
            <h3 className="text-base font-semibold">
              {t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.Started.title',
              )}
            </h3>
            <SubscriptionStatusBadge subscription={started} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.Started.period',
            )}{' '}
            <ServicePeriod
              from={started.currentPeriodStart}
              to={started.currentPeriodEnd}
            />
          </p>
          {invoice ? (
            <p className="text-sm">
              {t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.Started.activation',
              )}{' '}
              <Money amount={invoice.total} currency={invoice.currency} />{' '}
              <Link
                className="underline underline-offset-4"
                params={{ invoiceId: invoice.id }}
                to="/billing/invoices/$invoiceId"
              >
                {t(
                  'Pages.Customers.Instances.Detail.Billing.Subscribe.Started.viewInvoice',
                )}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.Started.noActivation',
                {
                  date: formatBoundary(started.currentPeriodEnd, i18n.language),
                },
              )}
            </p>
          )}
        </div>
      </StackedFormDialogPanel>
    </>
  );
}
