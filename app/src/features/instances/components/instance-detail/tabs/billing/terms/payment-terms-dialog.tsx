import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useBillingProvider } from '@/domains/billing';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { instanceBillingQueryOptions } from '../../../../../queries';
import { useInstanceDetail } from '../../../instance-detail-context';
import { DialogLoading, DialogNotice, DialogProblem } from '../dialog-states';
import { PaymentTermsForm } from './payment-terms-form';

type PaymentTermsDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

function PaymentTermsContent({ onClose }: PaymentTermsDialogProps) {
  const { t } = useTranslation();
  const { customer, instance } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const query = useQuery(instanceBillingQueryOptions(instanceSlug));
  const stripe = useBillingProvider('STRIPE');

  if (query.isError) {
    return (
      <DialogProblem
        error={query.error}
        onClose={onClose}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending || stripe.isPending) {
    return <DialogLoading fields={1} />;
  }
  const subscription = query.data;
  if (!subscription || subscription.status === 'CANCELED') {
    return (
      <DialogNotice onClose={onClose} testId="terms-unavailable">
        {t(
          subscription
            ? 'Pages.Customers.Instances.Detail.Billing.Terms.alreadyCanceled'
            : 'Pages.Customers.Instances.Detail.Billing.Terms.notSubscribed',
        )}
      </DialogNotice>
    );
  }

  // Who collects and how is the dialog's where a provider is offered, or collects the
  // contract already (a connection that went away does not take the choice from it): a
  // provider that is offered and not connected is listed, off, with the way to connect it.
  const withProvider =
    stripe.isOffered || subscription.providerKind === 'STRIPE';

  return (
    <PaymentTermsForm
      billingEmail={customer?.billingEmail}
      instanceSlug={instanceSlug}
      onClose={onClose}
      subscription={subscription}
      withProvider={withProvider}
    />
  );
}

/**
 * The dialog that changes the payment terms of a contract, a route of its own over
 * the Billing tab (`/billing/terms`): closing it leads back to the tab, and a link
 * to it opens it. A contract that ended has no terms to change, and says so. Where a
 * payment provider is offered it is also where the contract changes provider and
 * collection method, and is named for both.
 */
export function PaymentTermsDialog({ onClose }: PaymentTermsDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const { isOffered } = useBillingProvider('STRIPE');

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        isOffered
          ? 'Pages.Customers.Instances.Detail.Billing.Terms.dialogDescriptionWithProvider'
          : 'Pages.Customers.Instances.Detail.Billing.Terms.dialogDescription',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t(
        isOffered
          ? 'Pages.Customers.Instances.Detail.Billing.Terms.dialogTitleWithProvider'
          : 'Pages.Customers.Instances.Detail.Billing.Terms.dialogTitle',
        { name: instance.name },
      )}
    >
      <PaymentTermsContent onClose={onClose} />
    </StackedFormDialog>
  );
}
