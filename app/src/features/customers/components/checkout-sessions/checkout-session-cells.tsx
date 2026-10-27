import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { Money } from '@/domains/billing';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  type CheckoutLabels,
  getPeriodLabelKey,
  isExpiredWithRecords,
  nameOrId,
} from '../../utils/checkout-session';
import {
  CheckoutCustomerLink,
  CheckoutInstanceLink,
} from './checkout-session-links';

type SessionProps = { session: CheckoutSessionAdmin };
type LabelledSessionProps = SessionProps & { labels: CheckoutLabels };

/**
 * The e-mail the visitor gave, with the vendor's own reference under it when there is one.
 * It is the link that opens the panel of the checkout: a real link, so that the keyboard
 * reaches it and a new tab can open it, while a click anywhere else on the row opens it too.
 */
export function CheckoutEmailCell({ session }: SessionProps) {
  return (
    <div className="min-w-0">
      <Link
        data-session-id={session.sessionId}
        className="block truncate rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        search={(previous) => ({ ...previous, session: session.sessionId })}
        to="/customers/checkout-sessions"
      >
        {session.email}
      </Link>
      {session.clientReferenceId ? (
        <p className="truncate font-mono text-xs text-muted-foreground">
          {session.clientReferenceId}
        </p>
      ) : null}
    </div>
  );
}

/** The license the visitor chose, by its name, and the period it is billed over. */
export function CheckoutLicenseCell({ labels, session }: LabelledSessionProps) {
  const { t } = useTranslation();
  const periodKey = getPeriodLabelKey(session.billingPeriod);

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {nameOrId(labels.licenses, session.licenseSlug)}
      </p>
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
    <span className="block max-w-40 truncate text-sm" title={label}>
      {label}
    </span>
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
export function CheckoutCustomerCell({
  labels,
  session,
}: LabelledSessionProps) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 space-y-0.5">
      <CheckoutCustomerLink
        customerSlug={session.customerSlug}
        name={
          session.customerSlug
            ? labels.customers[session.customerSlug]
            : undefined
        }
      />
      {isExpiredWithRecords(session) ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Customers.CheckoutSessions.expiredRemains')}
        </p>
      ) : null}
    </div>
  );
}

/** The instance a completion created, linked to its Billing tab. */
export function CheckoutInstanceCell({
  labels,
  session,
}: LabelledSessionProps) {
  return (
    <CheckoutInstanceLink
      instanceSlug={session.instanceSlug}
      name={
        session.instanceSlug
          ? labels.instances[session.instanceSlug]
          : undefined
      }
    />
  );
}

/**
 * A moment of the checkout on two lines, the day and the time of day, or a dash while it
 * has not happened: narrow enough for the list to show both dates of a checkout.
 */
export function CheckoutInstantCell({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="text-sm whitespace-nowrap" title={formatDateTime(value)}>
      <p>{formatDate(value)}</p>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(value, { timeStyle: 'short' })}
      </p>
    </div>
  );
}
