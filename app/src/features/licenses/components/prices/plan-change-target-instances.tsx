import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatBoundary, useCanPerform } from '@/domains/billing';
import {
  type PlanChangeInstance,
  planChangeInstancesQueryOptions,
} from '../../queries';

type PlanChangeTargetInstancesProps = {
  priceId: string;
};

/** One instance scheduled to move to the price: the way to its Billing tab, and when it moves. */
function InstanceItem({ instance }: { instance: PlanChangeInstance }) {
  const { i18n, t } = useTranslation();

  return (
    <li>
      <Link
        className="underline underline-offset-4"
        params={{ instanceSlug: instance.instanceSlug }}
        to="/customers/instances/$instanceSlug/billing"
      >
        {instance.instanceName}
      </Link>{' '}
      <span className="text-muted-foreground">
        {t('Pages.Licenses.Prices.Deprecate.PlanChangeTarget.moves', {
          customer: instance.customerName,
          date: formatBoundary(instance.effectiveAt, i18n.language),
        })}
      </span>
    </li>
  );
}

/**
 * The instances a price cannot be deprecated for: the ones scheduled to move to it,
 * each with the way to its Billing tab, where the change is told and can be
 * cancelled. The API refuses the deprecation without naming them, so they are looked
 * for in the subscriptions once it has refused, and only by a session that may read
 * them. What it finds is a help to the refusal and never part of it: while it looks
 * the screen says so, and when it cannot read them, or finds none, it says nothing.
 */
export function PlanChangeTargetInstances({
  priceId,
}: PlanChangeTargetInstancesProps) {
  const { t } = useTranslation();
  const mayRead = useCanPerform('subscription.read');
  const query = useQuery({
    ...planChangeInstancesQueryOptions(priceId),
    enabled: mayRead,
  });

  if (!mayRead || query.isError) {
    return null;
  }
  if (query.isPending) {
    return (
      <p
        aria-busy="true"
        className="text-sm text-muted-foreground"
        role="status"
      >
        {t('Pages.Licenses.Prices.Deprecate.PlanChangeTarget.looking')}
      </p>
    );
  }
  if (query.data.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1 text-sm" data-testid="plan-change-instances">
      <p>{t('Pages.Licenses.Prices.Deprecate.PlanChangeTarget.instances')}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {query.data.map((instance) => (
          <InstanceItem instance={instance} key={instance.instanceSlug} />
        ))}
      </ul>
    </div>
  );
}
