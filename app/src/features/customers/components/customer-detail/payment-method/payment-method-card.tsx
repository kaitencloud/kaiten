import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  customerBillingQueryOptions,
  getProblemCode,
  getSafeProviderUrl,
  getStripePaymentMethod,
  ProblemAlert,
  RetryableProblem,
  useActionAccess,
  useBillingProvider,
} from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { usePaymentMethod } from '../../../hooks/use-payment-method';
import { useSetupReturn } from '../../../hooks/use-setup-return';
import { CurrencyDialog } from './currency-dialog';
import { PaymentMethodSummary } from './payment-method-summary';
import { RemoveDialog } from './remove-dialog';

type PaymentMethodCardProps = {
  customerSlug: string;
  /** Called once the session the customer came back with is dealt with: the address then drops it. */
  onSetupHandled: () => void;
  /** The `kaiten_setup_session` of the address, when the customer is back from the page Stripe hosts. */
  setupSessionId?: string;
};

const base = 'Pages.Customers.Detail.paymentMethod';

/**
 * The payment method of a customer in Stripe: the card Stripe charges for the contracts
 * that collect automatically, as labels. It is there only where Stripe is connected and
 * the session may read what a customer holds in the provider; the buttons only for one
 * that may write billing.
 *
 * Kaiten never sees a card. Adding or replacing one sends the browser to a page Stripe
 * hosts and the customer comes back to this page with the session in the address, which
 * the console then checks with the API (never trusting the redirect) before it drops it.
 * A customer with no live subscription has no currency to set the card up in, and the
 * API says so: the person is asked for one. The portal is Stripe's page for what the
 * customer manages there. Removing a card is refused while a live contract is charged
 * automatically, and the dialog says what to do first.
 */
export function PaymentMethodCard({
  customerSlug,
  onSetupHandled,
  setupSessionId,
}: PaymentMethodCardProps) {
  const { t } = useTranslation();
  const stripe = useBillingProvider('STRIPE');
  const read = useActionAccess('customer.billing.read');
  const write = useActionAccess('customer.paymentMethod.createSession');
  const available = stripe.isConnected && read.allowed;
  const query = useQuery({
    ...customerBillingQueryOptions(customerSlug),
    enabled: available,
  });
  const actions = usePaymentMethod(customerSlug);
  const [dialog, setDialog] = useState<'currency' | 'remove' | null>(null);

  useSetupReturn({
    complete: actions.complete,
    customerSlug,
    mayComplete:
      stripe.isPending || write.isPending
        ? undefined
        : stripe.isConnected && write.allowed,
    onHandled: onSetupHandled,
    sessionId: setupSessionId,
  });

  if (!available) {
    return null;
  }

  async function addOrReplace() {
    try {
      await actions.setup.start();
    } catch (error) {
      if (
        getProblemCode(error) === 'CreatePaymentMethodSession.CurrencyRequired'
      ) {
        setDialog('currency');
      }
    }
  }

  function renderBody() {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={t(`${base}.loading`)} role="status">
          <Skeleton className="h-12 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return (
        <RetryableProblem
          data-testid="payment-method-error"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      );
    }
    const method = getStripePaymentMethod(query.data);
    const record = query.data.providers.find(
      (provider) => provider.providerKind === 'STRIPE',
    );
    const dashboard = getSafeProviderUrl(record?.webUrl);

    return (
      <>
        <PaymentMethodSummary method={method} />
        {write.allowed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={actions.setup.isPending}
              onClick={() => void addOrReplace()}
              size="sm"
              type="button"
              variant={method ? 'outline' : 'default'}
            >
              {method ? <RefreshCw /> : <Plus />}
              {t(method ? `${base}.replace` : `${base}.add`)}
            </Button>
            {record && stripe.provider?.capabilities.billingPortal ? (
              <Button
                disabled={actions.portal.isPending}
                onClick={actions.portal.open}
                size="sm"
                type="button"
                variant="outline"
              >
                <ExternalLink />
                {t(`${base}.portal`)}
              </Button>
            ) : null}
            {method ? (
              <Button
                onClick={() => setDialog('remove')}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
                {t(`${base}.remove`)}
              </Button>
            ) : null}
          </div>
        ) : null}
        {dashboard ? (
          <a
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
            href={dashboard}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t(`${base}.openInStripe`)}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </>
    );
  }

  const setupFailed =
    actions.setup.error &&
    getProblemCode(actions.setup.error) !==
      'CreatePaymentMethodSession.CurrencyRequired';

  return (
    <section data-testid="payment-method-card">
      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>{t(`${base}.title`)}</DetailCard.Title>
          <DetailCard.Description>
            {t(`${base}.description`)}
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          {actions.complete.isError ? (
            <div
              className="space-y-3"
              data-testid="payment-method-setup-failed"
            >
              <ProblemAlert error={actions.complete.error} />
              <p className="text-sm text-muted-foreground">
                {t(`${base}.setupFailed`)}
              </p>
              <Button
                disabled={actions.complete.isPending}
                onClick={() => {
                  if (actions.complete.variables) {
                    actions.complete.mutate(actions.complete.variables);
                  }
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {t(`${base}.checkAgain`)}
              </Button>
            </div>
          ) : null}
          {setupFailed ? (
            <ProblemAlert
              error={actions.setup.error}
              onRetry={actions.setup.retry}
            />
          ) : null}
          {actions.portal.error ? (
            <ProblemAlert
              error={actions.portal.error}
              onRetry={actions.portal.open}
            />
          ) : null}
          {renderBody()}
        </DetailCard.Content>
      </DetailCard>
      {dialog === 'currency' ? (
        <CurrencyDialog
          onClose={() => setDialog(null)}
          onSubmit={(currency) => actions.setup.start(currency)}
        />
      ) : null}
      {dialog === 'remove' ? (
        <RemoveDialog
          onClose={() => setDialog(null)}
          onConfirm={() =>
            actions.detach.mutateAsync({ path: { customerSlug } })
          }
        />
      ) : null}
    </section>
  );
}
