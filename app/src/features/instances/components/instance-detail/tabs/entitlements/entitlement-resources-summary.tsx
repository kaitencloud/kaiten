import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';

type EntitlementResourcesSummaryProps = {
  /**
   * The instance whose resources the summary opens, which the session is allowed to list:
   * left out, the summary says the same and opens nothing.
   */
  linkTo?: { instanceSlug: string };
  row: Pick<
    InstanceEntitlementRow,
    'entitlementName' | 'entitlementSlug' | 'resources'
  >;
};

/**
 * What an entitlement that counts per resource says beside its figure, which is the highest
 * counter among its resources and would read as the instance's own count without it: how
 * many resources hold a counter, and how many of them are at the limit. Where the session may
 * list the resources it opens the list (`?resources=<entitlementSlug>`), a drawer over the
 * tab. Nothing for an entitlement that counts per instance, which has no such block.
 */
export function EntitlementResourcesSummary({
  linkTo,
  row,
}: EntitlementResourcesSummaryProps) {
  const { t } = useTranslation();
  const { resources } = row;

  if (!resources) {
    return null;
  }
  if (resources.count === 0) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid="entitlement-resources-summary"
      >
        {t('Pages.Customers.Instances.Detail.entitlements.resources.none')}
      </span>
    );
  }
  const text = t(
    'Pages.Customers.Instances.Detail.entitlements.resources.summary',
    { atLimit: resources.atLimit, count: resources.count },
  );
  const title = t(
    'Pages.Customers.Instances.Detail.entitlements.resources.highest',
    { count: resources.count },
  );

  if (!linkTo || !row.entitlementSlug) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid="entitlement-resources-summary"
        title={title}
      >
        {text}
      </span>
    );
  }

  return (
    <Button
      className="h-auto p-0 text-xs"
      data-row-actions
      data-testid="entitlement-resources-summary"
      nativeButton={false}
      render={
        <Link
          params={{ instanceSlug: linkTo.instanceSlug }}
          search={{ resources: row.entitlementSlug }}
          title={title}
          to="/customers/instances/$instanceSlug/entitlements"
        >
          {text}
        </Link>
      }
      role="link"
      size="xs"
      variant="link"
    />
  );
}
