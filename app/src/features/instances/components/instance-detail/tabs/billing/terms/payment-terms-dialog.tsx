import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { instance } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const query = useQuery(instanceBillingQueryOptions(instanceSlug));

  if (query.isError) {
    return (
      <DialogProblem
        error={query.error}
        onClose={onClose}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isPending) {
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

  return (
    <PaymentTermsForm
      instanceSlug={instanceSlug}
      onClose={onClose}
      subscription={subscription}
    />
  );
}

/**
 * The dialog that changes the payment terms of a contract, a route of its own over
 * the Billing tab (`/billing/terms`): closing it leads back to the tab, and a link
 * to it opens it. A contract that ended has no terms to change, and says so.
 */
export function PaymentTermsDialog({ onClose }: PaymentTermsDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        'Pages.Customers.Instances.Detail.Billing.Terms.dialogDescription',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t('Pages.Customers.Instances.Detail.Billing.Terms.dialogTitle', {
        name: instance.name,
      })}
    >
      <PaymentTermsContent onClose={onClose} />
    </StackedFormDialog>
  );
}
