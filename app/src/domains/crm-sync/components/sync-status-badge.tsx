import { formatDateTime } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SyncStatusBadge({ lastError }: { lastError: string | null }) {
  const { t } = useTranslation();
  if (lastError) {
    return (
      <Badge variant="destructive" className="gap-1" title={lastError}>
        <XCircle className="size-3" />
        {t('Pages.Integrations.Connectors.Detail.SyncedRecords.statusError')}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 border-success-subtle-foreground/30 bg-success-subtle text-success-subtle-foreground hover:bg-success-subtle">
      <CheckCircle2 className="size-3" />
      {t('Pages.Integrations.Connectors.Detail.SyncedRecords.statusSynced')}
    </Badge>
  );
}

export function formatSyncedAt(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatDateTime(date);
}
