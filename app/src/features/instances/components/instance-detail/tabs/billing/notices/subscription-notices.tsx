import type { InstanceBilling } from '@/api-client';
import {
  getSubscriptionNotices,
  type SubscriptionNotice,
} from '../../../../../utils/subscription-notices.utils';
import { CancellationNotice } from './cancellation-notice';
import { PastDueNotice } from './past-due-notice';
import { ScheduledChangeNotice } from './scheduled-change-notice';
import { TrialNotice } from './trial-notice';

type SubscriptionNoticesProps = {
  instanceSlug: string;
  subscription: InstanceBilling;
};

/**
 * What a subscription is going through, above the cards that describe it: a trial
 * that runs, an invoice that is overdue, a cancellation or a plan change that waits
 * for the boundary. Each is a sentence of its own and says what is still true, so
 * that the state of a subscription is never left to the color of a badge. A
 * subscription that is just running has none, and neither has one that ended.
 */
export function SubscriptionNotices({
  instanceSlug,
  subscription,
}: SubscriptionNoticesProps) {
  const notices = getSubscriptionNotices(subscription);

  function renderNotice(notice: SubscriptionNotice) {
    switch (notice) {
      case 'past-due':
        return (
          <PastDueNotice
            instanceSlug={instanceSlug}
            key={notice}
            subscription={subscription}
          />
        );
      case 'trial':
        return <TrialNotice key={notice} subscription={subscription} />;
      case 'cancellation':
        return (
          <CancellationNotice
            instanceSlug={instanceSlug}
            key={notice}
            subscription={subscription}
          />
        );
      case 'scheduled-change':
        return subscription.scheduledChange ? (
          <ScheduledChangeNotice
            instanceSlug={instanceSlug}
            key={notice}
            scheduledChange={subscription.scheduledChange}
            subscription={subscription}
          />
        ) : null;
    }
  }

  if (notices.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 xl:col-span-2" data-testid="subscription-notices">
      {notices.map(renderNotice)}
    </div>
  );
}
