import { Card, CardContent } from '@/components/ui/card';
import { History as HistoryIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function HistoryEmptyState() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="py-8 text-center">
          <HistoryIcon className="text-muted-foreground mx-auto mb-4 size-12 opacity-50" />
          <p className="text-muted-foreground mb-2">
            {t('Pages.Integrations.Webhooks.History.emptyState')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Integrations.Webhooks.History.emptyStateHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
