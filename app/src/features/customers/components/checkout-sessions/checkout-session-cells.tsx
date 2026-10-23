import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { Money } from '@/domains/billing';
import { formatDateTime } from '@/lib/format-date';
import {
  getPeriodLabelKey,
  isExpiredWithRecords,
} from '../../utils/checkout-session';
import {
  CheckoutCustomerLink,
  CheckoutInstanceLink,
} from './checkout-session-links';

type SessionProps = { session: CheckoutSessionAdmin };

/** The e-mail the visitor gave, with the vendor's own reference under it when there is one. */
export function CheckoutEmailCell({ session }: SessionProps) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{session.email}</p>
      {session.clientReferenceId ? (
        <p className="truncate font-mono text-xs text-muted-foreground">
          {session.clientReferenceId}
        </p>
      ) : null}
    </div>
  );
}

/** The licence the visitor chose and the period it is billed over. */
export function CheckoutPlanCell({ session }: SessionProps) {
  const { t } = useTranslation();
  const periodKey = getPeriodLabelKey(session.billingPeriod);

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{session.licenseSlug}</p>
      <p className="truncate text-xs text-muted-foreground">
        {periodKey ? t(periodKey) : session.billingPeriod}
      </p>
    </div>
  );
}

/** What the checkout asked for today, the amount of the API in its own currency. */
export function CheckoutDueTodayCell({ session }: SessionProps) {
  return (
    <Money
      amount={session.dueToday.total}
      className="text-sm"
      currency={session.dueToday.currency}
    />
  );
}

/**
 * The label of the key whose page started the checkout. The label is the key list's to
 * give: a session that may not read the keys, or a list still on its way, shows the id.
 */
export function CheckoutKeyCell({
  keyLabels,
  publishableKeyId,
}: {
  keyLabels: Readonly<Record<string, string>>;
  publishableKeyId: string;
}) {
  const label = keyLabels[publishableKeyId];

  return label ? (
    <span className="text-sm">{label}</span>
  ) : (
    <span
      className="block max-w-40 truncate font-mono text-xs text-muted-foreground"
      title={publishableKeyId}
    >
      {publishableKeyId}
    </span>
  );
}

/** The customer a completion created; an expired checkout says that it stays. */
export function CheckoutCustomerCell({ session }: SessionProps) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 space-y-0.5">
      <CheckoutCustomerLink customerSlug={session.customerSlug} />
      {isExpiredWithRecords(session) ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Customers.CheckoutSessions.expiredRemains')}
        </p>
      ) : null}
    </div>
  );
}

/** The instance a completion created, linked to its Billing tab. */
export function CheckoutInstanceCell({ session }: SessionProps) {
  return <CheckoutInstanceLink instanceSlug={session.instanceSlug} />;
}

/** A moment of the checkout, or a dash while it has not happened. */
export function CheckoutInstantCell({ value }: { value: string | null }) {
  return (
    <span className="text-sm">
      {value ? (
        formatDateTime(value)
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </span>
  );
}
