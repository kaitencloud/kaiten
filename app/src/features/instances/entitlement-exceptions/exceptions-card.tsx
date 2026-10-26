import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntitlementException } from '@/api-client';
import { getEntitlementsUsageMetricsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RetryableProblem,
  formatUtcDate,
  useGrantedScopes,
} from '@/domains/billing';
import {
  TableCard,
  TableActions,
  type ColumnDef,
  createActionsColumn,
} from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { hasScope } from '@/lib/granted-scopes';
import { useInstanceDetail } from '../components/instance-detail/instance-detail-context';
import { entitlementExceptionsQueryOptions } from './exception-query-options';

export function ExceptionsCard() {
  const { t, i18n } = useTranslation();
  const { instance, entitlements } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const access = useGrantedScopes();
  const queryClient = useQueryClient();
  const read = !access.isPending && hasScope(access.scopes, 'read:instances');
  const write = !access.isPending && hasScope(access.scopes, 'write:instances');
  const exceptions = useQuery({
    ...entitlementExceptionsQueryOptions(instanceSlug),
    enabled: read,
  });
  // A timed list refresh must also refresh the effective view, even when no mutation happened.
  useEffect(() => {
    if (exceptions.dataUpdatedAt)
      void queryClient.invalidateQueries({
        queryKey: getEntitlementsUsageMetricsQueryKey({
          path: { instanceSlug },
        }),
      });
  }, [exceptions.dataUpdatedAt, instanceSlug, queryClient]);
  const KEY = 'Pages.EntitlementExceptions';
  const Icon = dataModelIcons.entitlement;
  function renderActions(exception: EntitlementException) {
    if (!write || !['ACTIVE', 'SCHEDULED'].includes(exception.status))
      return null;
    return (
      <TableActions>
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link
              to="/customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke"
              params={{ instanceSlug, exceptionId: exception.id }}
            />
          }
        >
          {t(`${KEY}.end`)}
        </Button>
      </TableActions>
    );
  }
  const columns: ColumnDef<EntitlementException>[] = [
    {
      accessorKey: 'entitlementSlug',
      header: t(`${KEY}.entitlement`),
      cell: ({ row }) =>
        entitlements.find((item) => item.slug === row.original.entitlementSlug)
          ?.name ?? row.original.entitlementSlug,
    },
    {
      accessorKey: 'status',
      header: t(`${KEY}.status`),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(`${KEY}.statuses.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'kind',
      header: t(`${KEY}.kind`),
      cell: ({ row }) => t(`${KEY}.kinds.${row.original.kind}`),
    },
    {
      accessorKey: 'value',
      header: t(`${KEY}.value`),
      cell: ({ row }) =>
        typeof row.original.value === 'boolean'
          ? t(row.original.value ? `${KEY}.enabled` : `${KEY}.disabled`)
          : row.original.value === null
            ? t(`${KEY}.unlimited`)
            : JSON.stringify(row.original.value),
    },
    {
      accessorKey: 'startsAt',
      header: t(`${KEY}.startsAt`),
      cell: ({ row }) => formatUtcDate(row.original.startsAt, i18n.language),
    },
    {
      accessorKey: 'endsAt',
      header: t(`${KEY}.endsAt`),
      cell: ({ row }) =>
        row.original.endsAt
          ? formatUtcDate(row.original.endsAt, i18n.language)
          : t(`${KEY}.noEnd`),
    },
    { accessorKey: 'reason', header: t(`${KEY}.reason`) },
    createActionsColumn(renderActions),
  ];
  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <Icon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>{t(`${KEY}.title`)}</TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t(`${KEY}.description`)}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        {write && (
          <Button
            render={
              <Link
                to="/customers/instances/$instanceSlug/entitlements/exceptions/new"
                params={{ instanceSlug }}
              />
            }
          >
            {t(`${KEY}.create`)}
          </Button>
        )}
      </TableCard.Header>
      {!read ? (
        <p role="status">{t(`${KEY}.forbidden`)}</p>
      ) : exceptions.isPending ? (
        <Skeleton aria-label={t(`${KEY}.loading`)} className="h-20" />
      ) : exceptions.isError ? (
        <RetryableProblem
          error={exceptions.error}
          onRetry={() => void exceptions.refetch()}
        />
      ) : (
        <TableCard.Table
          columns={columns}
          data={exceptions.data}
          emptyMessage={t(`${KEY}.empty`)}
          variant="simple"
        />
      )}
    </TableCard>
  );
}
