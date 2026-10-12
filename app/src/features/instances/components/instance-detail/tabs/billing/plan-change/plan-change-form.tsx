import { Suspense, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  BoundaryClosingNotice,
  ProblemAlert,
  RetryableProblem,
} from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { usePlanChangeForm } from '../../../../../hooks/use-plan-change-form';
import { usePlanTargets } from '../../../../../hooks/use-plan-targets';
import { DialogLoading } from '../dialog-states';
import { PlanChangeFields } from './plan-change-fields';
import { PlanChangeTimeline } from './plan-change-timeline';
import { ScheduledChangeSummary } from './scheduled-change-summary';

type PlanChangeFormProps = {
  instanceSlug: string;
  onClose: () => void;
  subscription: InstanceBilling;
};

/**
 * The form that moves a subscription to another plan at the next boundary. The
 * plans come from the versions on sale, found with one read per version; while
 * they are on the way the form is a skeleton, and a read that failed is shown
 * with a way to ask again. When a change is already scheduled it is said first,
 * with the way to drop it, since choosing another plan replaces it.
 */
export function PlanChangeForm({
  instanceSlug,
  onClose,
  subscription,
}: PlanChangeFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const targets = usePlanTargets(subscription);
  const { closing, failure, form } = usePlanChangeForm({
    instanceSlug,
    onScheduled: onClose,
  });

  function renderTargets() {
    if (targets.isError) {
      return (
        <RetryableProblem error={targets.error} onRetry={targets.refetch} />
      );
    }
    if (targets.isPending) {
      return <DialogLoading fields={1} />;
    }
    if (targets.targets.length === 0) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="no-plan">
          {t('Pages.Customers.Instances.Detail.Billing.PlanChange.noPlan')}
        </p>
      );
    }

    return (
      <Suspense fallback={<DialogLoading fields={1} />}>
        <PlanChangeFields
          form={form}
          subscription={subscription}
          targets={targets.targets}
        />
      </Suspense>
    );
  }

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            form={formId}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.PlanChange.confirm',
            )}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            {subscription.scheduledChange ? (
              <ScheduledChangeSummary
                instanceSlug={instanceSlug}
                scheduledChange={subscription.scheduledChange}
                targets={targets.targets}
              />
            ) : null}
            <PlanChangeTimeline
              instanceSlug={instanceSlug}
              subscription={subscription}
            />
            {renderTargets()}
            {closing ? <BoundaryClosingNotice /> : null}
            {failure && !closing ? (
              <ProblemAlert
                autoFocus
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
          </div>
        </StackedFormDialogPanel>
      </form>
    </form.AppForm>
  );
}
