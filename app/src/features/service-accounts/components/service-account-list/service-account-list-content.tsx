import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ServiceAccount } from '../../types';
import { ServiceAccountListItem } from './service-account-list-item';

interface ServiceAccountListContentProps {
  filteredServiceAccounts: ServiceAccount[];
  onDeleteServiceAccount: (serviceAccountId: string) => void;
  onGenerateToken: (serviceAccountSlug: string) => void;
  onRevokeToken: (serviceAccountSlug: string, tokenSlug: string) => void;
  serviceAccounts: ServiceAccount[];
}

export function ServiceAccountListContent({
  filteredServiceAccounts,
  onDeleteServiceAccount,
  onGenerateToken,
  onRevokeToken,
  serviceAccounts,
}: ServiceAccountListContentProps) {
  const { t } = useTranslation();
  const ServiceAccountsIcon = dataModelIcons.serviceAccount;

  function renderServiceAccount(serviceAccount: ServiceAccount) {
    return (
      <ServiceAccountListItem
        key={serviceAccount.id}
        sa={serviceAccount}
        onGenerateToken={onGenerateToken}
        onDeleteServiceAccount={onDeleteServiceAccount}
        onRevokeToken={onRevokeToken}
      />
    );
  }

  if (serviceAccounts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="py-8 text-center">
            <ServiceAccountsIcon className="text-muted-foreground mx-auto mb-4 size-12 opacity-50" />
            <p className="text-muted-foreground">
              {t('Pages.Integrations.ServiceAccounts.emptyState')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (filteredServiceAccounts.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t('Common.noResults')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredServiceAccounts.map(renderServiceAccount)}
    </div>
  );
}
