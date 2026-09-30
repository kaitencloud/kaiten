import { useTranslation } from 'react-i18next';
import type { Instance } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { InstanceLifecycleStageBadge } from '@/domains/customer-management';

type InstanceInfoCardProps = {
  createdByName: string;
  customerName?: string | null;
  instance: Instance;
  updatedByName: string;
  formatDateTime: (value: string) => string;
};

export const InstanceInfoCard = ({
  createdByName,
  customerName,
  instance,
  updatedByName,
  formatDateTime,
}: InstanceInfoCardProps) => {
  const { t } = useTranslation();

  return (
    <DetailCard>
      <DetailCard.Header>
        <div>
          <DetailCard.Title className="text-base">
            {t('Pages.Customers.Instances.Detail.instanceDetails.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            {t('Pages.Customers.Instances.Detail.instanceDetails.description')}
          </DetailCard.Description>
        </div>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t('Pages.Customers.Instances.Detail.fields.name')}
            value={instance.name}
          />
          <DetailCard.Row
            align="start"
            label={t('Pages.Customers.Instances.Detail.fields.description')}
            value={instance.description}
            valueClassName="max-w-xl font-normal text-muted-foreground"
          />
          <DetailCard.Row
            label={t('Pages.Customers.Instances.Detail.fields.customer')}
            value={
              customerName ??
              t('Pages.Customers.Instances.Detail.fallback.unknownCustomer')
            }
          />
          <DetailCard.Row
            label={t(
              'Pages.Customers.Instances.Detail.lifecycleStageEditor.label',
            )}
            value={
              <InstanceLifecycleStageBadge stage={instance.lifecycleStage} />
            }
          />
        </DetailCard.Rows>

        <DetailCard.Divider />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('Pages.Customers.Instances.Detail.audit.createdAt')}
            </p>
            <p className="text-sm">{formatDateTime(instance.createdAt)}</p>
            {createdByName ? (
              <p className="text-xs text-muted-foreground">
                {t('Pages.Customers.Instances.Detail.audit.by')} {createdByName}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-muted-foreground">
              {t('Pages.Customers.Instances.Detail.audit.updatedAt')}
            </p>
            <p className="text-sm">{formatDateTime(instance.updatedAt)}</p>
            {updatedByName ? (
              <p className="text-xs text-muted-foreground">
                {t('Pages.Customers.Instances.Detail.audit.by')} {updatedByName}
              </p>
            ) : null}
          </div>
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
};
