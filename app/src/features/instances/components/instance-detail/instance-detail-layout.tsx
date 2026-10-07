import { Button } from '@/components/ui/button';
import { Link, useNavigate } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { EditableTitle, Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { instanceDetailsFormValuesToInstanceInput } from '../../utils/instance-form.shared';
import { InstanceStatusEditor } from '../instance-status-editor';
import { useInstanceDetail } from './instance-detail-context';
import { InstanceDetailQuickStats } from './instance-detail-quick-stats';
import { useInstanceDetailTabs } from './use-instance-detail-tabs';

type InstanceDetailLayoutProps = PropsWithChildren<{
  instanceId: string;
}>;

const InstanceIcon = dataModelIcons.instance;

export const InstanceDetailLayout = ({
  instanceId,
  children,
}: InstanceDetailLayoutProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeTab, items } = useInstanceDetailTabs(instanceId);
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

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <InstanceIcon className="size-8 text-primary-subtle-foreground" />
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
        <InstanceDetailQuickStats
          daysLeft={daysLeft}
          endLicenseDate={instance.endLicenseDate}
          entitlementsMetrics={entitlementsMetrics}
          urgencyTextClassName={urgencyTextClassName}
        />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        <DetailEntityLayout.Tabs activeTab={activeTab} items={items} />
        <DetailEntityLayout.Content>{children}</DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
};
