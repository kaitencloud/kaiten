import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { dataModelIcons } from '@/lib/data-model-icons';

const LINK_CLASS_NAME =
  'inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/** The customer a completed checkout created, as a link to its page; a dash before one exists. */
export function CheckoutCustomerLink({
  customerSlug,
}: {
  customerSlug: string | null;
}) {
  const CustomerIcon = dataModelIcons.customer;

  if (!customerSlug) {
    return <NoRecord />;
  }

  return (
    <Link
      className={LINK_CLASS_NAME}
      params={{ customerSlug }}
      to="/customers/$customerSlug"
    >
      <CustomerIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{customerSlug}</span>
    </Link>
  );
}

/**
 * The instance a completed checkout created, as a link to the Billing tab of the
 * instance: the subscription the checkout started is what a vendor goes there to read.
 */
export function CheckoutInstanceLink({
  instanceSlug,
}: {
  instanceSlug: string | null;
}) {
  const InstanceIcon = dataModelIcons.instance;

  if (!instanceSlug) {
    return <NoRecord />;
  }

  return (
    <Link
      className={LINK_CLASS_NAME}
      params={{ instanceSlug }}
      to="/customers/instances/$instanceSlug/billing"
    >
      <InstanceIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{instanceSlug}</span>
    </Link>
  );
}

/** Before the completion runs, and for a checkout that never completed, there is no record to link to. */
function NoRecord() {
  const { t } = useTranslation();

  return (
    <span
      aria-label={t('Pages.Customers.CheckoutSessions.noRecord')}
      className="text-sm text-muted-foreground"
    >
      —
    </span>
  );
}
