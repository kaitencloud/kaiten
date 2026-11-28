import { useTranslation } from 'react-i18next';
import {
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
  RetryableProblem,
} from '@/domains/billing';
import { DataTable } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useEntitlementResources } from '../../../../../hooks/use-entitlement-resources';
import {
  type ResourceLimit,
  useEntitlementResourcesColumns,
} from './entitlement-resources-columns';

type EntitlementResourcesListProps = {
  canViewHistory: boolean;
  entitlementName: string;
  entitlementSlug: string;
  instanceSlug: string;
  limit: ResourceLimit;
  locale: string;
};

const getResourceId = (resource: { resourceKey: string }) =>
  resource.resourceKey;

/**
 * The resources read so far, as the states around them: reading, refused with a way to ask
 * again, none, and some with more to read. "Load more" asks for the resources after the last
 * one read, and those already shown stay where they are.
 */
export function EntitlementResourcesList({
  canViewHistory,
  entitlementName,
  entitlementSlug,
  instanceSlug,
  limit,
  locale,
}: EntitlementResourcesListProps) {
  const { t } = useTranslation();
  const { query, resources } = useEntitlementResources(
    instanceSlug,
    entitlementSlug,
  );
  const columns = useEntitlementResourcesColumns({
    canViewHistory,
    entitlementName,
    entitlementSlug,
    instanceSlug,
    limit,
    locale,
  });
  const Icon = dataModelIcons.entitlement;

  if (query.isPending) {
    return (
      <PagedListSkeleton
        label={t(
          'Pages.Customers.Instances.Detail.entitlements.resources.loading',
        )}
        rowClassName="h-10"
        rows={6}
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <RetryableProblem
        data-testid="entitlement-resources-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (resources.length === 0) {
    return (
      <ListEmptyState
        className="gap-1 py-10"
        description={t(
          'Pages.Customers.Instances.Detail.entitlements.resources.Empty.description',
        )}
        icon={Icon}
        testId="entitlement-resources-empty"
        title={t(
          'Pages.Customers.Instances.Detail.entitlements.resources.Empty.title',
        )}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="entitlement-resources-list">
      <div className="overflow-hidden rounded-lg border">
        <DataTable
          columns={columns}
          data={resources}
          getRowId={getResourceId}
          pagination={false}
          variant="simple"
        />
      </div>
      <LoadMoreFooter
        loadMoreLabel={t(
          'Pages.Customers.Instances.Detail.entitlements.resources.loadMore',
        )}
        query={query}
      />
    </div>
  );
}
