import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Eye, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditTrail } from '@/api-client/types.gen';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import { getEventCategory, resolveEventLabel } from '@/domains/audit-trail';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDateTime } from '@/lib/detail';
import {
  getEntitlementLabelForAuditSlug,
  getPayload,
} from './audit-trail.utils';

const EntitlementIcon = dataModelIcons.entitlement;

function getDialogEventIcon(category: ReturnType<typeof getEventCategory>) {
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

export function AuditDetailDialog({
  entry,
  entitlementsRows,
  instanceName,
}: {
  entry: AuditTrail;
  entitlementsRows: InstanceEntitlementRow[];
  /** Display name of the current instance (audit entries belong to this instance). */
  instanceName: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const category = getEventCategory(entry.eventName);
  const { Icon, iconClassName } = getDialogEventIcon(category);
  const statusBadge =
    category === 'accepted' ? (
      <Badge variant="success">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.accepted',
        )}
      </Badge>
    ) : category === 'rejected' ? (
      <Badge variant="destructive">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.rejected',
        )}
      </Badge>
    ) : category === 'warning' ? (
      <Badge
        variant="outline"
        className="border-warning-subtle-foreground/30 bg-warning-subtle text-warning-subtle-foreground"
      >
        {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.warning')}
      </Badge>
    ) : (
      <Badge variant="outline">
        {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.read')}
      </Badge>
    );
  const payload = getPayload(entry);
  const entitlementLabel = payload.entitlement_slug
    ? getEntitlementLabelForAuditSlug(
        payload.entitlement_slug,
        entitlementsRows,
      )
    : undefined;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t(
              'Pages.Customers.Instances.Detail.auditTrail.table.actions.viewDetails',
            )}
          >
            <Eye className="size-4" />
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`size-5 shrink-0 ${iconClassName}`} />
            {resolveEventLabel(entry.eventName, t)}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {entry.eventName}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.auditTrail.detail.eventId',
                )}
              </span>
              <p className="font-mono text-sm">#{entry.id}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('Pages.Customers.Instances.Detail.auditTrail.detail.status')}
              </span>
              <div>{statusBadge}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.auditTrail.detail.timestamp',
                )}
              </span>
              <p className="text-sm">
                {formatDateTime(entry.timestamp, locale)}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.auditTrail.detail.instance',
                )}
              </span>
              <p className="text-sm">{instanceName}</p>
            </div>
          </div>
          {payload.entitlement_slug && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.auditTrail.detail.entitlement',
                )}
              </span>
              <div className="flex items-center gap-2">
                <EntitlementIcon className="size-4 shrink-0 text-primary-subtle-foreground" />
                <span className="text-sm font-medium">{entitlementLabel}</span>
                {payload.type && (
                  <Badge variant="outline" className="text-xs">
                    {payload.type}
                  </Badge>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t(
                'Pages.Customers.Instances.Detail.auditTrail.detail.fullPayload',
              )}
            </span>
            <div className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-xs">
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
