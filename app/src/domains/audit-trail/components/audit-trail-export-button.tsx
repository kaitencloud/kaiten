import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { GlobalAuditEntry } from '../audit-trail.types';
import { downloadAuditTrailCsv } from '../audit-trail-export';

export function AuditTrailExportButton({
  entries,
  getEventLabel,
}: {
  entries: GlobalAuditEntry[];
  getEventLabel: (eventName: string) => string;
}) {
  const { t } = useTranslation();

  const handleExport = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadAuditTrailCsv(entries, getEventLabel, dateStamp);
    toast.success(t('Pages.AuditTrail.exported', { count: entries.length }));
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleExport}
      disabled={entries.length === 0}
    >
      <Download className="size-4" aria-hidden />
      {t('Pages.AuditTrail.export')}
    </Button>
  );
}
