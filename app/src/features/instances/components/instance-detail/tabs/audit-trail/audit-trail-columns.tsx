import { Badge } from '@/components/ui/badge';
import type { TFunction } from 'i18next';
import { AlertTriangle, CheckCircle, Eye, XCircle } from 'lucide-react';
import type { AuditTrail } from '@/api-client/types.gen';
import { getEventCategory, resolveEventLabel } from '@/domains/audit-trail';
import type { ColumnDef } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDateTime } from '@/lib/detail';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import { AuditDetailDialog } from './audit-trail-detail-dialog';
import {
  formatRelativeTimeToNow,
  getEntitlementLabelForAuditSlug,
  getPayload,
} from './audit-trail.utils';

const EntitlementIcon = dataModelIcons.entitlement;

function getEventIcon(category: ReturnType<typeof getEventCategory>) {
  if (category === 'rejected') {
    return {
      Icon: XCircle,
      iconClassName: 'text-destructive-subtle-foreground',
    };
  }

  if (category === 'warning') {
    return {
      Icon: AlertTriangle,
      iconClassName: 'text-warning-subtle-foreground',
    };
  }

  if (category === 'accepted') {
    return {
      Icon: CheckCircle,
      iconClassName: 'text-success-subtle-foreground',
    };
  }

  return {
    Icon: Eye,
    iconClassName: 'text-primary-subtle-foreground',
  };
}

function AuditTrailIdCell({ entry }: { entry: AuditTrail }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">#{entry.id}</span>
  );
}

function AuditTrailEventCell({
  entry,
  t,
}: {
  entry: AuditTrail;
  t: TFunction;
}) {
  const category = getEventCategory(entry.eventName);
  const { Icon, iconClassName } = getEventIcon(category);

  return (
    <div className="flex items-center gap-2">
      <Icon className={`size-4 ${iconClassName}`} />
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {resolveEventLabel(entry.eventName, t)}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {entry.eventName}
        </span>
      </div>
    </div>
  );
}

function AuditTrailEntitlementCell({
  entry,
  entitlementsRows,
}: {
  entry: AuditTrail;
  entitlementsRows: InstanceEntitlementRow[];
}) {
  const payload = getPayload(entry);

  if (!payload.entitlement_slug) {
    return null;
  }

  const label = getEntitlementLabelForAuditSlug(
    payload.entitlement_slug,
    entitlementsRows,
  );

  return (
    <div className="flex items-center gap-2">
      <EntitlementIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      {payload.type ? (
        <Badge variant="outline" className="px-1.5 py-0 text-xs">
          {payload.type}
        </Badge>
      ) : null}
    </div>
  );
}

function AuditTrailStatusCell({
  entry,
  t,
}: {
  entry: AuditTrail;
  t: TFunction;
}) {
  const category = getEventCategory(entry.eventName);

  if (category === 'accepted') {
    return (
      <Badge variant="success">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.accepted',
        )}
      </Badge>
    );
  }

  if (category === 'rejected') {
    return (
      <Badge variant="destructive">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.rejected',
        )}
      </Badge>
    );
  }

  if (category === 'warning') {
    return (
      <Badge
        variant="outline"
        className="border-warning-subtle-foreground/30 bg-warning-subtle text-warning-subtle-foreground"
      >
        {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.warning')}
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.read')}
    </Badge>
  );
}

function AuditTrailTimestampCell({
  entry,
  locale,
}: {
  entry: AuditTrail;
  locale: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm">
        {formatRelativeTimeToNow(entry.timestamp, locale)}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatDateTime(entry.timestamp, locale)}
      </span>
    </div>
  );
}

export const buildAuditTrailColumns = (
  t: TFunction,
  locale: string,
  entitlementsRows: InstanceEntitlementRow[],
  instanceName: string,
): ColumnDef<AuditTrail>[] => [
  {
    accessorKey: 'id',
    header: t('Pages.Customers.Instances.Detail.auditTrail.table.headers.id'),
    cell: ({ row }) => <AuditTrailIdCell entry={row.original} />,
    meta: {
      cellClassName: 'w-16',
      headerClassName: 'w-16',
    },
  },
  {
    accessorKey: 'eventName',
    header: t(
      'Pages.Customers.Instances.Detail.auditTrail.table.headers.event',
    ),
    cell: ({ row }) => <AuditTrailEventCell entry={row.original} t={t} />,
  },
  {
    id: 'entitlement',
    header: t(
      'Pages.Customers.Instances.Detail.auditTrail.table.headers.entitlement',
    ),
    cell: ({ row }) => (
      <AuditTrailEntitlementCell
        entry={row.original}
        entitlementsRows={entitlementsRows}
      />
    ),
  },
  {
    id: 'status',
    header: t(
      'Pages.Customers.Instances.Detail.auditTrail.table.headers.status',
    ),
    cell: ({ row }) => <AuditTrailStatusCell entry={row.original} t={t} />,
  },
  {
    accessorKey: 'timestamp',
    header: t(
      'Pages.Customers.Instances.Detail.auditTrail.table.headers.timestamp',
    ),
    cell: ({ row }) => (
      <AuditTrailTimestampCell entry={row.original} locale={locale} />
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <AuditDetailDialog
        entry={row.original}
        entitlementsRows={entitlementsRows}
        instanceName={instanceName}
      />
    ),
    meta: {
      cellClassName: 'w-14',
      headerClassName: 'w-14',
    },
  },
];
