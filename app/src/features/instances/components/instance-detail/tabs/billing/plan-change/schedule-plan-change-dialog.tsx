import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { instanceBillingQueryOptions } from '../../../../../queries';
import {
  getPlanChangeBlock,
  type PlanChangeBlock,
} from '../../../../../utils/plan-change.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { DialogLoading, DialogNotice, DialogProblem } from '../dialog-states';
import { PlanChangeForm } from './plan-change-form';

type SchedulePlanChangeDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

const BLOCK_KEYS = {
  canceled:
    'Pages.Customers.Instances.Detail.Billing.PlanChange.alreadyCanceled',
  'cancellation-scheduled':
    'Pages.Customers.Instances.Detail.Billing.PlanChange.cancellationScheduled',
  'not-subscribed':
    'Pages.Customers.Instances.Detail.Billing.PlanChange.notSubscribed',
  trial: 'Pages.Customers.Instances.Detail.Billing.PlanChange.trial',
} as const satisfies Record<PlanChangeBlock, string>;

function PlanChangeContent({ onClose }: SchedulePlanChangeDialogProps) {
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
    return <DialogLoading fields={2} />;
  }
  const subscription = query.data;
  // The link may be followed from anywhere: say why there is nothing to change
  // rather than open a form the API would refuse.
  const block = getPlanChangeBlock(subscription ?? null);
  if (!subscription || block) {
    return (
      <DialogNotice onClose={onClose} testId="plan-change-unavailable">
        {t(BLOCK_KEYS[block ?? 'not-subscribed'])}
      </DialogNotice>
    );
  }

  return (
    <PlanChangeForm
      instanceSlug={instanceSlug}
      onClose={onClose}
      subscription={subscription}
    />
  );
}

/**
 * The dialog that schedules the move of a subscription to another plan, a route of
 * its own over the Billing tab (`/billing/plan-change`): closing it leads back to
 * the tab, and a link to it opens it. A subscription that cannot change plan (a
 * trial, one that is set to cancel, one that ended) says why instead.
 */
export function SchedulePlanChangeDialog({
  onClose,
}: SchedulePlanChangeDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        'Pages.Customers.Instances.Detail.Billing.PlanChange.dialogDescription',
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t(
        'Pages.Customers.Instances.Detail.Billing.PlanChange.dialogTitle',
        { name: instance.name },
      )}
    >
      <PlanChangeContent onClose={onClose} />
    </StackedFormDialog>
  );
}
