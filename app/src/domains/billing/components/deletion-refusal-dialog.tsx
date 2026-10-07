import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog';
import { Button } from '@/components/ui/button';
import {
  type DeletionRefusal,
  getDeletionRefusalDescriptionKey,
  getDeletionRefusalTitleKey,
  getEntitlementReferenceLabelKey,
  hasPermanentReference,
} from '../logic/deletion-refusals';
import { SubscriptionStatusBadge } from './subscription-status-badge';

type DeletionRefusalDialogProps = {
  onClose: () => void;
  refusal: DeletionRefusal;
  /**
   * The record the refusal is about, to link to what the person does next: the
   * slug of the customer, of the instance or of the entitlement.
   */
  slug?: string;
};

function UnsettledInvoices({ ids }: { ids: string[] }) {
  const { t } = useTranslation();

  if (ids.length === 0) {
    return null;
  }

  function renderInvoice(id: string) {
    return (
      <li key={id}>
        <Link
          className="font-mono text-sm underline underline-offset-4"
          params={{ invoiceId: id }}
          to="/billing/invoices/$invoiceId"
        >
          {id}
        </Link>
      </li>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {t('Features.Billing.DeletionRefusal.unsettledTitle', {
          count: ids.length,
        })}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t('Features.Billing.DeletionRefusal.unsettledHint')}
      </p>
      <ul className="space-y-1" data-testid="deletion-refusal-invoices">
        {ids.map(renderInvoice)}
      </ul>
    </section>
  );
}

function InstanceBody({
  refusal,
  slug,
}: {
  refusal: Extract<DeletionRefusal, { kind: 'instance' }>;
  slug?: string;
}) {
  const { t } = useTranslation();
  const { status } = refusal;

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          {t('Features.Billing.DeletionRefusal.subscriptionTitle')}
        </h3>
        {status === 'ACTIVE' ||
        status === 'TRIAL' ||
        status === 'PAST_DUE' ||
        status === 'CANCELED' ? (
          <div className="flex flex-wrap items-center gap-2">
            <SubscriptionStatusBadge
              subscription={{ cancelAtPeriodEnd: false, status }}
            />
            <span className="text-sm text-muted-foreground">
              {t(
                status === 'CANCELED'
                  ? 'Features.Billing.DeletionRefusal.subscriptionEnded'
                  : 'Features.Billing.DeletionRefusal.subscriptionLive',
              )}
            </span>
          </div>
        ) : null}
        {slug ? (
          <Link
            className="text-sm underline underline-offset-4"
            params={{ instanceSlug: slug }}
            to="/customers/instances/$instanceSlug/billing"
          >
            {t('Features.Billing.DeletionRefusal.openSubscription')}
          </Link>
        ) : null}
      </section>
      <UnsettledInvoices ids={refusal.unpaidInvoiceIds} />
    </>
  );
}

function CustomerBody({
  refusal,
  slug,
}: {
  refusal: Extract<DeletionRefusal, { kind: 'customer' }>;
  slug?: string;
}) {
  const { t } = useTranslation();

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          {t('Features.Billing.DeletionRefusal.subscriptionTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            refusal.live
              ? 'Features.Billing.DeletionRefusal.customerLive'
              : 'Features.Billing.DeletionRefusal.customerNoneLive',
          )}
        </p>
        {slug ? (
          <Link
            className="text-sm underline underline-offset-4"
            params={{ customerSlug: slug }}
            to="/customers/$customerSlug"
          >
            {t('Features.Billing.DeletionRefusal.openInstances')}
          </Link>
        ) : null}
      </section>
      <UnsettledInvoices ids={refusal.unpaidInvoiceIds} />
    </>
  );
}

function EntitlementBody({
  refusal,
  slug,
}: {
  refusal: Extract<DeletionRefusal, { kind: 'entitlement' }>;
  slug?: string;
}) {
  const { t } = useTranslation();

  function renderReference({
    count,
    key,
  }: Extract<DeletionRefusal, { kind: 'entitlement' }>['references'][number]) {
    return (
      <li key={key}>{t(getEntitlementReferenceLabelKey(key), { count })}</li>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {t('Features.Billing.DeletionRefusal.referencesTitle')}
      </h3>
      <ul
        className="list-disc space-y-1 pl-5 text-sm"
        data-testid="deletion-refusal-references"
      >
        {refusal.references.map(renderReference)}
      </ul>
      <p className="text-sm text-muted-foreground">
        {t(
          hasPermanentReference(refusal.references)
            ? 'Features.Billing.DeletionRefusal.hideInstead'
            : 'Features.Billing.DeletionRefusal.removeFirst',
        )}
      </p>
      {slug ? (
        <Link
          className="text-sm underline underline-offset-4"
          params={{ entitlementSlug: slug }}
          to="/entitlements/$entitlementSlug"
        >
          {t('Features.Billing.DeletionRefusal.openEntitlement')}
        </Link>
      ) : null}
    </section>
  );
}

/**
 * What stands in the way of a deletion that the API refused because the record
 * is billed or in use: the subscription that lives, the invoices not settled yet,
 * what still grants, counts or prices an entitlement, each with a link to what
 * the person does about it. It is a dialog and not a toast, since a bare error
 * would leave them guessing what to settle first. Nothing was deleted: the
 * record stays where it was.
 */
export function DeletionRefusalDialog({
  onClose,
  refusal,
  slug,
}: DeletionRefusalDialogProps) {
  const { t } = useTranslation();

  return (
    <FormDialog onOpenChange={(open) => !open && onClose()} open>
      <FormDialog.Header>
        <FormDialog.Title>
          {t(getDeletionRefusalTitleKey(refusal.kind))}
        </FormDialog.Title>
        <FormDialog.Description>
          {refusal.detail ?? t(getDeletionRefusalDescriptionKey(refusal.kind))}
        </FormDialog.Description>
      </FormDialog.Header>
      <FormDialog.Content>
        <div className="space-y-5" data-testid="deletion-refusal">
          {refusal.kind === 'instance' ? (
            <InstanceBody refusal={refusal} slug={slug} />
          ) : null}
          {refusal.kind === 'customer' ? (
            <CustomerBody refusal={refusal} slug={slug} />
          ) : null}
          {refusal.kind === 'entitlement' ? (
            <EntitlementBody refusal={refusal} slug={slug} />
          ) : null}
        </div>
      </FormDialog.Content>
      <FormDialog.Footer>
        <Button onClick={onClose} type="button" variant="outline">
          {t('Common.close')}
        </Button>
      </FormDialog.Footer>
    </FormDialog>
  );
}
