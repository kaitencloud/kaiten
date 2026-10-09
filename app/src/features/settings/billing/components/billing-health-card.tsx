import { useQuery } from '@tanstack/react-query';
import { CircleCheck, HeartPulse, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  billingHealthQueryOptions,
  ProblemAlert,
  RetryableProblem,
  useActionAccess,
  useBillingProvider,
} from '@/domains/billing';
import { StatCard } from '@/functionals/stat-card';
import { SettingsCardHeader } from '../../components/settings-card-header';
import { useSyncBilling } from '../hooks/use-sync-billing';
import { getHealthItems, isAllClear } from '../utils/billing-health';
import { BillingHealthTile } from './billing-health-tile';

/**
 * What needs a person's attention in billing, counted when the page is read: held
 * invoices, pushes that keep failing, what is overdue or waits for the accounting
 * system, invoices whose provider disagrees, periods that did not close and
 * subscriptions that are not paid. Each count is a figure, and a link to the invoices
 * it counts where the list can filter to them. When every count is zero the card
 * says that nothing needs attention instead of six zeros.
 *
 * Where a payment provider is connected, "Sync now" runs a pass of it without
 * waiting for the periodic one, and says what it did. A session that may not read the
 * health does not see the card; one that may read and not sync sees no button.
 */
export function BillingHealthCard() {
  const { t } = useTranslation();
  const { allowed: mayRead, isPending: isReadingScopes } =
    useActionAccess('health.read');
  const { allowed: maySync } = useActionAccess('health.sync');
  const stripe = useBillingProvider('STRIPE');
  const query = useQuery({ ...billingHealthQueryOptions, enabled: mayRead });
  const sync = useSyncBilling();

  if (!mayRead && !isReadingScopes) {
    return null;
  }

  function renderBody() {
    if (isReadingScopes || query.isPending) {
      return (
        <div
          aria-busy="true"
          aria-label={t('Pages.Settings.Billing.Health.loading')}
          role="status"
        >
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return (
        <RetryableProblem
          data-testid="billing-health-error"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      );
    }
    const items = getHealthItems(query.data);

    if (isAllClear(items)) {
      return (
        <div
          className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
          data-testid="billing-health-clear"
          role="status"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-subtle-foreground" />
          <div className="space-y-0.5">
            <p className="font-medium">
              {t('Pages.Settings.Billing.Health.AllClear.title')}
            </p>
            <p className="text-muted-foreground">
              {t('Pages.Settings.Billing.Health.AllClear.description')}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div data-testid="billing-health-tiles">
        <StatCard.Row columnsClassName="md:grid-cols-2 xl:grid-cols-4" dense>
          {items.map((item) => (
            <BillingHealthTile item={item} key={item.id} />
          ))}
        </StatCard.Row>
      </div>
    );
  }

  return (
    <Card data-testid="billing-health">
      <SettingsCardHeader
        action={
          stripe.isConnected && maySync ? (
            <Button
              disabled={sync.isPending}
              onClick={() => sync.mutate({})}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={sync.isPending ? 'animate-spin' : undefined}
              />
              {t(
                sync.isPending
                  ? 'Pages.Settings.Billing.Health.syncing'
                  : 'Pages.Settings.Billing.Health.syncNow',
              )}
            </Button>
          ) : undefined
        }
        description={t('Pages.Settings.Billing.Health.description')}
        icon={HeartPulse}
        title={t('Pages.Settings.Billing.Health.title')}
      />
      <CardContent className="space-y-4">
        {sync.isError ? (
          <ProblemAlert error={sync.error} onRetry={() => sync.mutate({})} />
        ) : null}
        {renderBody()}
      </CardContent>
    </Card>
  );
}
