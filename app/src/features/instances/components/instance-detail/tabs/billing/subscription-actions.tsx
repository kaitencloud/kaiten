import { Link } from '@tanstack/react-router';
import { ArrowRightLeft, Ban, CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getSubscriptionActions,
  type SubscriptionActionAvailability,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';

type SubscriptionActionsProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

type ActionProps = { instanceSlug: string };

/** The plan change, greyed out with its reason when the state forbids it: a button the keyboard still reaches. */
function ChangePlanAction({
  availability,
  instanceSlug,
}: ActionProps & {
  availability: Exclude<
    SubscriptionActionAvailability,
    { availability: 'hidden' }
  >;
}) {
  const { t } = useTranslation();
  const label = t('Pages.Customers.Instances.Detail.Billing.PlanChange.open');

  if (availability.availability === 'disabled') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={<span className="inline-flex" tabIndex={0} />}
          >
            <Button disabled size="sm" type="button" variant="outline">
              <ArrowRightLeft />
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            {t(availability.reasonKey)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          params={{ instanceSlug }}
          to="/customers/instances/$instanceSlug/billing/plan-change"
        >
          <ArrowRightLeft />
          {label}
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

function TermsAction({ instanceSlug }: ActionProps) {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          params={{ instanceSlug }}
          to="/customers/instances/$instanceSlug/billing/terms"
        >
          <CalendarClock />
          {t('Pages.Customers.Instances.Detail.Billing.Terms.open')}
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

function CancelAction({ instanceSlug }: ActionProps) {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          params={{ instanceSlug }}
          to="/customers/instances/$instanceSlug/billing/cancel"
        >
          <Ban />
          {t('Pages.Customers.Instances.Detail.Billing.Cancel.open')}
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

/**
 * What a session may do to a live subscription, under its card: move it to
 * another plan, change its payment terms, cancel it. Each leads to a dialog of its
 * own. They are there only where the release ships the lifecycle and the session
 * holds the scope of the action, and what the state of the subscription forbids is
 * not removed but greyed out with the reason: a plan cannot change during a trial
 * or while a cancellation is scheduled, and the person is told what to do first.
 * The taking back of a cancellation is in its notice, where it is read.
 */
export function SubscriptionActions({
  instanceSlug,
  subscription,
}: SubscriptionActionsProps) {
  const { has } = useBillingCapabilities();
  const mayChangePlan = useCanPerform('subscription.schedulePlanChange');
  const mayEditTerms = useCanPerform('subscription.updateTerms');
  const mayCancel = useCanPerform('subscription.cancel');

  if (!has('lifecycle')) {
    return null;
  }
  const actions = getSubscriptionActions(subscription);
  const changePlan = actions.schedulePlanChange;
  const showTerms =
    mayEditTerms && actions.updateTerms.availability !== 'hidden';
  const showCancel = mayCancel && actions.cancel.availability !== 'hidden';

  if (
    changePlan.availability === 'hidden' ||
    !(mayChangePlan || showTerms || showCancel)
  ) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-2 border-t pt-4"
      data-testid="subscription-actions"
    >
      {mayChangePlan ? (
        <ChangePlanAction
          availability={changePlan}
          instanceSlug={instanceSlug}
        />
      ) : null}
      {showTerms ? <TermsAction instanceSlug={instanceSlug} /> : null}
      {showCancel ? <CancelAction instanceSlug={instanceSlug} /> : null}
    </div>
  );
}
