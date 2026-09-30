import { GradientButton } from '@/components/gradient-button';
import {
  InstanceLifecycleStageBadge,
  InstanceStatusBadge,
} from '@/domains/customer-management';
import { formatDate } from '@/lib/format-date';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GetInstancesWithRelationsQuery } from '@/api-client/graphql/graphql';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { capitalizeFromUpperCase } from '@/lib/utils';

type InstanceRow = GetInstancesWithRelationsQuery['instances']['items'][number];

type CustomerInstancesCardProps = {
  customerSlug: string;
  instances: InstanceRow[];
};

export const CustomerInstancesCard = ({
  customerSlug,
  instances,
}: CustomerInstancesCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const InstanceIcon = dataModelIcons.instance;

  const getInstancePath = (instance: InstanceRow) =>
    router.buildLocation({
      to: '/customers/instances/$instanceSlug',
      params: { instanceSlug: instance.slug },
    }).pathname;

  const columns = useMemo<ColumnDef<InstanceRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Pages.Customers.Detail.instances.columns.name'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'license',
        header: t('Pages.Customers.Detail.instances.columns.license'),
        cell: ({ row }) => row.original.license?.name ?? '—',
      },
      {
        accessorKey: 'type',
        header: t('Pages.Customers.Detail.instances.columns.type'),
        cell: ({ row }) =>
          row.original.license?.type
            ? t(
                `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(row.original.license.type)}`,
              )
            : '—',
      },
      // The same badges as the instances list: this card is where a
      // customer's instances are looked at first.
      {
        accessorKey: 'status',
        header: t('Pages.Customers.Detail.instances.columns.status'),
        cell: ({ row }) => <InstanceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'lifecycleStage',
        header: t('Pages.Customers.Detail.instances.columns.lifecycle'),
        cell: ({ row }) => (
          <InstanceLifecycleStageBadge stage={row.original.lifecycleStage} />
        ),
      },
      {
        accessorKey: 'startLicenseDate',
        header: t('Pages.Customers.Detail.instances.columns.start'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.startLicenseDate)}
          </span>
        ),
      },
      {
        accessorKey: 'endLicenseDate',
        header: t('Pages.Customers.Detail.instances.columns.end'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.endLicenseDate)}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <TableCard>
      <TableCard.Header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <InstanceIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Customers.Detail.instances.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Customers.Detail.instances.description')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>

        <TableCard.HeaderActions>
          <GradientButton
            label={t('Pages.Customers.Instances.Mutation.titleNew')}
            onClick={() => {
              navigate({
                to: '/customers/$customerSlug/instances/new',
                params: { customerSlug },
              });
            }}
          />
        </TableCard.HeaderActions>
      </TableCard.Header>
      <TableCard.Table
        columns={columns}
        data={instances}
        variant="simple"
        getPath={getInstancePath}
        emptyMessage={t('Pages.Customers.Detail.instances.empty')}
      />
    </TableCard>
  );
};
