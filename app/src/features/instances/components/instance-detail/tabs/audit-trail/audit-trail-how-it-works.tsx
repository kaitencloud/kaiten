import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Eye, Shield, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function AuditTrailHowItWorksItem({
  description,
  iconClassName,
  Icon,
  title,
}: {
  description: string;
  iconClassName: string;
  Icon: typeof Eye;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${iconClassName}`} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function AuditTrailHowItWorks() {
  const { t } = useTranslation();

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-primary-subtle-foreground" />
          {t('Pages.Customers.Instances.Detail.auditTrail.howItWorks.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <AuditTrailHowItWorksItem
            description={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.entitlementRead.description',
            )}
            iconClassName="text-primary-subtle-foreground"
            Icon={Eye}
            title={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.entitlementRead.title',
            )}
          />
          <AuditTrailHowItWorksItem
            description={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.usageAccepted.description',
            )}
            iconClassName="text-success-subtle-foreground"
            Icon={CheckCircle}
            title={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.usageAccepted.title',
            )}
          />
          <AuditTrailHowItWorksItem
            description={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.usageRejected.description',
            )}
            iconClassName="text-destructive-subtle-foreground"
            Icon={XCircle}
            title={t(
              'Pages.Customers.Instances.Detail.auditTrail.howItWorks.items.usageRejected.title',
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
