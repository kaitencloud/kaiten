import { LoaderCircle, Send, TriangleAlert, FileClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatInstant, isAwaitingFinalization } from '@/domains/billing';
import type { PushPhase } from '../../hooks';

type InvoiceProviderAlertsProps = {
  invoice: Invoice;
  /** Where the push the person asked for stands; nothing is shown of one that was not. */
  phase: PushPhase;
};

// The codes the provider gives a failed automatic charge that the console has words
// for. Any other is shown as the provider coded it.
const PAYMENT_ERROR_CODES = [
  'authentication_required',
  'card_declined',
  'expired_card',
  'no_payment_method',
] as const;

const isKnownPaymentError = (
  code: string,
): code is (typeof PAYMENT_ERROR_CODES)[number] =>
  (PAYMENT_ERROR_CODES as readonly string[]).includes(code);

function PushStatus({ phase }: { phase: Exclude<PushPhase, 'idle'> }) {
  const { t } = useTranslation();
  const base = 'Pages.Billing.Invoices.Detail.Provider.Push';

  return (
    <Alert data-phase={phase} data-testid="invoice-push-status" role="status">
      {phase === 'waiting' ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <Send />
      )}
      <AlertTitle>{t(`${base}.${phase}.title`)}</AlertTitle>
      <AlertDescription>{t(`${base}.${phase}.description`)}</AlertDescription>
    </Alert>
  );
}

/**
 * What an invoice that Stripe collects asks a person to look at, above the cards: a
 * push that is running or is out of time, a draft Stripe holds for a person to
 * finalize, a push that failed with what Stripe answered, and a charge that failed
 * with the customer's next step. Each is absent when the invoice has none of it, and
 * none is shown for an invoice nobody collects through a provider.
 */
export function InvoiceProviderAlerts({
  invoice,
  phase,
}: InvoiceProviderAlertsProps) {
  const { i18n, t } = useTranslation();
  const { provider } = invoice;

  if (invoice.providerKind !== 'STRIPE') {
    return null;
  }
  const paymentError = provider?.lastPaymentError;

  return (
    <div className="space-y-3">
      {phase === 'idle' ? null : <PushStatus phase={phase} />}
      {isAwaitingFinalization(invoice) ? (
        <Alert data-testid="invoice-awaiting-finalization">
          <FileClock />
          <AlertTitle>
            {t('Pages.Billing.Invoices.Detail.Provider.Review.title')}
          </AlertTitle>
          <AlertDescription>
            {t('Pages.Billing.Invoices.Detail.Provider.Review.description')}
          </AlertDescription>
        </Alert>
      ) : null}
      {provider?.lastPushError ? (
        <Alert data-testid="invoice-push-error" variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {t('Pages.Billing.Invoices.Detail.Provider.PushError.title')}
          </AlertTitle>
          <AlertDescription>
            <p className="break-words">{provider.lastPushError}</p>
            <p>
              {t('Pages.Billing.Invoices.Detail.Provider.PushError.attempts', {
                count: provider.pushAttempts,
              })}{' '}
              {provider.nextPushAt
                ? t('Pages.Billing.Invoices.Detail.Provider.PushError.next', {
                    date: formatInstant(provider.nextPushAt, i18n.language),
                  })
                : t('Pages.Billing.Invoices.Detail.Provider.PushError.manual')}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {paymentError ? (
        <Alert data-testid="invoice-payment-error" variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {t('Pages.Billing.Invoices.Detail.Provider.PaymentError.title')}
          </AlertTitle>
          <AlertDescription>
            <p className="break-words">
              {isKnownPaymentError(paymentError)
                ? t(
                    `Pages.Billing.Invoices.Detail.Provider.PaymentError.Codes.${paymentError}`,
                  )
                : paymentError}
            </p>
            {isKnownPaymentError(paymentError) ? (
              <p className="font-mono text-xs">{paymentError}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
