import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getCustomerDetailTarget } from '../../utils/customer-path';

const LINK_CLASS_NAME =
  'inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/** The customer a completed checkout created, as a link to its page; a dash before one exists. */
export function CheckoutCustomerLink({
  customerSlug,
  name,
}: {
  customerSlug: string | null;
  /** The name of the customer, when it is known: the slug stands in for it otherwise. */
  name?: string;
}) {
  const CustomerIcon = dataModelIcons.customer;

  if (!customerSlug) {
    return <NoRecord />;
  }

  return (
    <Link
      className={LINK_CLASS_NAME}
      {...getCustomerDetailTarget(customerSlug)}
    >
      <CustomerIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate" title={customerSlug}>
        {name ?? customerSlug}
      </span>
    </Link>
  );
}

/**
 * The instance a completed checkout created, as a link to the Billing tab of the
 * instance: the subscription the checkout started is what a vendor goes there to read.
 */
export function CheckoutInstanceLink({
  instanceSlug,
  name,
}: {
  instanceSlug: string | null;
  /** The name of the instance, when it is known: the slug stands in for it otherwise. */
  name?: string;
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
      <span className="truncate" title={instanceSlug}>
        {name ?? instanceSlug}
      </span>
    </Link>
  );
}

/** Before the completion runs, and for a checkout that never completed, there is no record to link to. */
function NoRecord() {
  const { t } = useTranslation();

  return (
    <span className="text-sm text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">
        {t('Pages.Customers.CheckoutSessions.noRecord')}
      </span>
    </span>
  );
}
