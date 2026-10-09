import { Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatBoundary, Money, useAlertFocus } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import type { CancelOutcome } from '../../../../../utils/cancellation.utils';
import { FollowUpsReport } from './cancel-follow-ups-report';

type CanceledStateProps = {
  onClose: () => void;
  outcome: CancelOutcome;
};

/**
 * What the dialog says once the cancellation was accepted: when the subscription
 * ends and what is billed then, or the final invoice it issued, and what became
 * of the add-ons and the end of the license when they were asked for. The tab
 * behind it already shows the new state. It takes the focus the button that sent
 * the form had: that button is gone with the form, and the keyboard would land on
 * nothing.
 */
export function CanceledState({ onClose, outcome }: CanceledStateProps) {
  const { i18n, t } = useTranslation();
  const { canceled, kind } = outcome;
  const statusRef = useAlertFocus(true, outcome);
  const invoice = canceled.finalInvoice;
  const date = formatBoundary(canceled.currentPeriodEnd, i18n.language);

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
          data-testid="canceled"
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
                kind === 'SCHEDULED'
                  ? 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.scheduledTitle'
                  : kind === 'TRIAL'
                    ? 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.trialTitle'
                    : 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.immediateTitle',
              )}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              kind === 'SCHEDULED'
                ? 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.scheduled'
                : kind === 'TRIAL'
                  ? 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.trial'
                  : 'Pages.Customers.Instances.Detail.Billing.Cancel.Done.immediate',
              { date },
            )}
          </p>
          {kind === 'IMMEDIATE' ? (
            <p className="text-sm">
              {invoice ? (
                <>
                  {t(
                    'Pages.Customers.Instances.Detail.Billing.Cancel.Done.finalInvoice',
                  )}{' '}
                  <Money amount={invoice.total} currency={invoice.currency} />{' '}
                  <Link
                    className="underline underline-offset-4"
                    params={{ invoiceId: invoice.id }}
                    to="/invoices/$invoiceId"
                  >
                    {t(
                      'Pages.Customers.Instances.Detail.Billing.Cancel.Done.viewInvoice',
                    )}
                  </Link>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t(
                    'Pages.Customers.Instances.Detail.Billing.Cancel.Done.noFinalInvoice',
                  )}
                </span>
              )}
            </p>
          ) : null}
          <FollowUpsReport outcome={outcome} />
        </div>
      </StackedFormDialogPanel>
    </>
  );
}
