import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Instance, License } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { capitalizeFromUpperCase } from '@/lib/utils';
import { formatDate } from '../../../../../utils/instance-detail-overview.utils';
import { InstanceRelatedLink } from './instance-related-link';

type InstanceLicenseCardProps = {
  instance: Instance;
  license?: License | null;
  licenseProgress: number;
  licenseSlug: string;
};

export const InstanceLicenseCard = ({
  instance,
  license,
  licenseProgress,
  licenseSlug,
}: InstanceLicenseCardProps) => {
  const { t } = useTranslation();
  const licenseName =
    license?.name ??
    t('Pages.Customers.Instances.Detail.fallback.unknownLicense');

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title className="text-base flex items-center gap-2">
          <Shield className="size-4 text-primary-subtle-foreground" />
          {t('Pages.Customers.Instances.Detail.license.title')}
        </DetailCard.Title>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t('Pages.Customers.Instances.Detail.license.plan')}
            value={
              licenseSlug ? (
                <InstanceRelatedLink
                  to="/licenses/$licenseSlug"
                  params={{ licenseSlug }}
                  className="text-sm"
                >
                  {licenseName}
                </InstanceRelatedLink>
              ) : (
                licenseName
              )
            }
          />
          <DetailCard.Row
            label={t('Pages.Customers.Instances.Detail.license.type')}
            value={
              <Badge variant="outline">
                {license?.type
                  ? t(
                      `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(license.type)}`,
                    )
                  : '-'}
              </Badge>
            }
          />
          <DetailCard.Row
            label={t('Pages.Customers.Instances.Detail.license.version')}
            value={license?.version ?? '-'}
          />
        </DetailCard.Rows>

        <DetailCard.Divider />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t('Pages.Customers.Instances.Detail.license.period')}
          </p>
          <p className="text-sm">
            {formatDate(instance.startLicenseDate)} -{' '}
            {formatDate(instance.endLicenseDate)}
          </p>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${licenseProgress}%` }}
            />
          </div>
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
};
