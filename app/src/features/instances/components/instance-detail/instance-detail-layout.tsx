import { Button } from '@/components/ui/button';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  Calendar,
  KeyRound,
  Pencil,
  Server,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { EditableTitle, Page } from '@/functionals/page';
import { StatCard } from '@/functionals/stat-card';
import { getActiveTabFromPathname } from '@/lib/detail';
import { formatDate } from '../../utils/instance-detail-overview.utils';
import { formatTimeUntil } from '../../utils/instance-detail.utils';
import { instanceDetailsFormValuesToInstanceInput } from '../../utils/instance-form.shared';
import { InstanceStatusEditor } from '../instance-status-editor';
import { useInstanceDetail } from './instance-detail-context';

type InstanceDetailLayoutProps = PropsWithChildren<{
  instanceId: string;
}>;

export const InstanceDetailLayout = ({
  instanceId,
  children,
}: InstanceDetailLayoutProps) => {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [
      { suffix: '/entitlements', value: 'entitlements' },
      { suffix: '/audit-trail', value: 'audit-trail' },
    ],
    pathname,
  });
  const {
    instance,
    customer,
    license,
    daysLeft,
    urgencyTextClassName,
    entitlementsMetrics,
    deleteInstance,
    forgetDeletedInstance,
    isDeleting,
    updateInstance,
    updateInstanceStatus,
    isUpdatingStatus,
  } = useInstanceDetail();

  const handleRename = async (name: string) => {
    await updateInstance(
      instanceDetailsFormValuesToInstanceInput(
        {
          name,
          description: instance.description,
          customerId: instance.customerId,
        },
        instance,
      ),
    );
  };

  const entitlementsValueClassName =
    entitlementsMetrics.total === 0
      ? undefined
      : entitlementsMetrics.enabled === entitlementsMetrics.total
        ? 'text-success-subtle-foreground'
        : 'text-warning-subtle-foreground';
  // The warning tint belongs to an alert, not to the card: "0 near limit"
  // stays neutral so nothing draws the eye to a count of nothing.
  const usageAlertsToneClassName =
    entitlementsMetrics.nearThreshold > 0
      ? 'text-warning-subtle-foreground'
      : undefined;

  return (
    <DetailEntityLayout
      activeTab={activeTab}
      header={
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Server className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.TitleRow>
                <Page.Title>
                  <EditableTitle
                    value={instance.name}
                    onSave={handleRename}
                    minLength={3}
                    label={t(
                      'Pages.Customers.Instances.Detail.editName',
                      'Edit name',
                    )}
                  />
                </Page.Title>
                <InstanceStatusEditor
                  status={instance.status}
                  onSelect={(status, previousStatus) =>
                    updateInstanceStatus({ status }, previousStatus)
                  }
                  isUpdating={isUpdatingStatus}
                />
              </Page.TitleRow>
              <Page.Subtitle>
                {customer?.name ??
                  t(
                    'Pages.Customers.Instances.Detail.fallback.unknownCustomer',
                  )}{' '}
                &middot;{' '}
                {license?.name ??
                  t('Pages.Customers.Instances.Detail.fallback.unknownLicense')}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>

          <Page.Actions>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="gap-2"
                nativeButton={false}
                role="link"
                render={
                  <Link
                    to="/customers/instances/$instanceSlug"
                    params={{ instanceSlug: instanceId }}
                    search={{ mode: 'configure' }}
                  >
                    <Pencil className="size-4" />
                    {t('Common.edit')}
                  </Link>
                }
              />
              <DestructiveActionButton
                label={t('Common.delete')}
                title={t('Pages.Customers.Instances.confirmDeleteTitle')}
                description={t(
                  'Pages.Customers.Instances.confirmDeleteDescription',
                  {
                    name: instance.name,
                  },
                )}
                cancelLabel={t('Common.cancel')}
                confirmLabel={t('Common.confirm')}
                onConfirm={async () => {
                  await deleteInstance();
                  // Leave before reconciling the cache. This route observes the
                  // instance through useSuspenseQuery, so dropping or
                  // revalidating its detail query while still mounted fetches a
                  // row DELETE has just removed.
                  await navigate({ to: '/customers/instances' });
                  await forgetDeletedInstance();
                }}
                disabled={isDeleting}
              />
            </div>
          </Page.Actions>
        </Page.Header>
      }
      stats={
        <StatCard.Row columnsClassName="md:grid-cols-3">
          <StatCard>
            <StatCard.Label>
              {t('Pages.Customers.Instances.Detail.quickStats.licenseExpires')}
            </StatCard.Label>
            <StatCard.Icon>
              <Calendar />
            </StatCard.Icon>
            <StatCard.Value className={urgencyTextClassName}>
              {daysLeft > 0
                ? formatDate(instance.endLicenseDate)
                : t('Pages.Customers.Instances.Detail.quickStats.expired')}
            </StatCard.Value>
            <StatCard.Helper>
              {daysLeft > 0
                ? formatTimeUntil(daysLeft, i18n.resolvedLanguage)
                : formatDate(instance.endLicenseDate)}
            </StatCard.Helper>
          </StatCard>
          <StatCard>
            <StatCard.Label>
              {t('Pages.Customers.Instances.Detail.quickStats.entitlements')}
            </StatCard.Label>
            <StatCard.Icon>
              <KeyRound />
            </StatCard.Icon>
            <StatCard.Value className={entitlementsValueClassName}>
              {entitlementsMetrics.enabled}/{entitlementsMetrics.total}
            </StatCard.Value>
          </StatCard>
          <StatCard>
            <StatCard.Label>
              {t('Pages.Customers.Instances.Detail.quickStats.usageAlerts')}
            </StatCard.Label>
            <StatCard.Icon className={usageAlertsToneClassName}>
              <AlertTriangle />
            </StatCard.Icon>
            <StatCard.Value className={usageAlertsToneClassName}>
              {entitlementsMetrics.nearThreshold}
              <StatCard.Unit>
                {t('Pages.Customers.Instances.Detail.quickStats.nearLimit')}
              </StatCard.Unit>
            </StatCard.Value>
            {/* Both scopes are worth an alert, but a period-scoped counter clears
                at the next reset while a lifetime one never does. */}
            {entitlementsMetrics.nearThresholdCurrentPeriod > 0 ? (
              <StatCard.Helper>
                {t(
                  'Pages.Customers.Instances.Detail.quickStats.nearLimitCurrentPeriod',
                  { count: entitlementsMetrics.nearThresholdCurrentPeriod },
                )}
              </StatCard.Helper>
            ) : null}
          </StatCard>
        </StatCard.Row>
      }
      tabs={[
        {
          label: t('Pages.Customers.Instances.Detail.tabs.overview'),
          params: { instanceSlug: instanceId },
          to: '/customers/instances/$instanceSlug',
          value: 'overview',
        },
        {
          label: t('Pages.Customers.Instances.Detail.tabs.entitlements'),
          params: { instanceSlug: instanceId },
          to: '/customers/instances/$instanceSlug/entitlements',
          value: 'entitlements',
        },
        {
          label: t('Pages.Customers.Instances.Detail.tabs.auditTrail'),
          params: { instanceSlug: instanceId },
          to: '/customers/instances/$instanceSlug/audit-trail',
          value: 'audit-trail',
        },
      ]}
    >
      {children}
    </DetailEntityLayout>
  );
};
