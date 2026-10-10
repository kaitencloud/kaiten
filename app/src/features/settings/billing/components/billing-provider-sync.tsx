import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type BillingProviderKind,
  billingHealthQueryOptions,
  useActionAccess,
} from '@/domains/billing';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import { getProviderSyncStanding } from '../utils/billing-health';

type ProviderSyncLineProps = {
  kind: BillingProviderKind;
};

/**
 * How the last pass of a payment provider went, under its name: when it ran, or
 * that the passes keep failing and what the last one said. A pass that failed
 * is the one thing on the card that is not a state of the connection, so it reads
 * as a warning. The health is read by the card of the health too and is shared with
 * it; a session that may not read it, or a read that failed (the health card says
 * why), shows no line rather than a guess.
 */
export function ProviderSyncLine({ kind }: ProviderSyncLineProps) {
  const { i18n, t } = useTranslation();
  const { allowed: mayRead } = useActionAccess('health.read');
  const { data } = useQuery({ ...billingHealthQueryOptions, enabled: mayRead });

  if (!mayRead || !data) {
    return null;
  }
  const standing = getProviderSyncStanding(data, kind);
  const base = 'Pages.Settings.Billing.Providers.Stripe.Sync';

  if (standing.kind === 'never') {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-standing="never"
        data-testid="billing-provider-sync"
      >
        {t(`${base}.never`)}
      </p>
    );
  }
  const ago = formatRelativeTimeToNow(standing.at, i18n.language);
  const failing = standing.kind === 'failing';
  const text =
    standing.kind === 'failing'
      ? t(`${base}.failing`, { ago, count: standing.failures })
      : t(standing.kind === 'partial' ? `${base}.partial` : `${base}.ok`, {
          ago,
        });

  return (
    <div
      className={
        failing || standing.kind === 'partial'
          ? 'space-y-0.5 text-sm text-warning-subtle-foreground'
          : 'text-sm text-muted-foreground'
      }
      data-standing={standing.kind}
      data-testid="billing-provider-sync"
    >
      <p className="flex items-start gap-1.5">
        {failing || standing.kind === 'partial' ? (
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        ) : null}
        <span title={standing.at}>{text}</span>
      </p>
      {standing.error ? (
        <p className="break-words pl-5.5 text-xs">
          {t(`${base}.error`, { error: standing.error })}
        </p>
      ) : null}
    </div>
  );
}
