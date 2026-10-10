import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { instanceBillingQueryOptions } from '../../../../../queries';
import type { CancelOutcome } from '../../../../../utils/cancellation.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { DialogLoading, DialogNotice, DialogProblem } from '../dialog-states';
import { CancelSubscriptionForm } from './cancel-subscription-form';
import { CanceledState } from './canceled-state';

type CancelSubscriptionDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

/**
 * The subscription as it was when the dialog opened. Cancelling refreshes the
 * subscription behind the dialog, which would otherwise swap the form for "it is
 * already canceled" before the dialog has said what it did.
 */
function useOpenedSubscription() {
  const { instance } = useInstanceDetail();
  const query = useQuery(
    instanceBillingQueryOptions(instance.slug ?? instance.id),
  );
  const [opened, setOpened] = useState(query.data);

  if (opened === undefined && query.data !== undefined) {
    setOpened(query.data);
  }

  return { opened, query };
}

function CancelContent({
  onCanceled,
  onClose,
}: {
  onCanceled: (outcome: CancelOutcome) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { opened, query } = useOpenedSubscription();

  if (query.isError && opened === undefined) {
    return (
      <DialogProblem
        error={query.error}
        onClose={onClose}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (opened === undefined) {
    return <DialogLoading fields={2} />;
  }
  if (opened === null || opened.status === 'CANCELED') {
    return (
      <DialogNotice onClose={onClose} testId="cancel-unavailable">
        {t(
          opened === null
            ? 'Pages.Customers.Instances.Detail.Billing.Cancel.notSubscribed'
            : 'Pages.Customers.Instances.Detail.Billing.Cancel.alreadyCanceled',
        )}
      </DialogNotice>
    );
  }

  return (
    <CancelSubscriptionForm
      onCancel={onClose}
      onCanceled={onCanceled}
      subscription={opened}
    />
  );
}

/**
 * The dialog that cancels the subscription of an instance, a route of its own over
 * the Billing tab (`/billing/cancel`): closing it leads back to the tab, and a link
 * to it opens it. Once the cancellation has been accepted it says what it did, with
 * the way to the final invoice when one was issued, and stays until it is closed;
 * until then a refusal leaves it open with what was typed.
 */
export function CancelSubscriptionDialog({
  onClose,
}: CancelSubscriptionDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const [outcome, setOutcome] = useState<CancelOutcome | null>(null);

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        'Pages.Customers.Instances.Detail.Billing.Cancel.dialogDescription',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t('Pages.Customers.Instances.Detail.Billing.Cancel.dialogTitle', {
        name: instance.name,
      })}
    >
      {outcome ? (
        <CanceledState onClose={onClose} outcome={outcome} />
      ) : (
        <CancelContent onCanceled={setOutcome} onClose={onClose} />
      )}
    </StackedFormDialog>
  );
}
