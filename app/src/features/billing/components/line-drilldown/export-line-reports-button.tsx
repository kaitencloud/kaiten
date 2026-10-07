import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useExportLineReports } from '../../hooks';

type ExportLineReportsButtonProps = {
  invoiceId: string;
  lineId: string;
  /** The position of the line on its invoice, which names the file. */
  lineSeq: number;
};

/**
 * Saves every usage report the line was measured from as a CSV, however many
 * pages the screen has read: a spreadsheet is where a customer's usage gets
 * checked against its own records. A refusal of the API is shown as it was
 * written, and nothing on the screen changes.
 */
export function ExportLineReportsButton({
  invoiceId,
  lineId,
  lineSeq,
}: ExportLineReportsButtonProps) {
  const { t } = useTranslation();
  const { isPending, mutate } = useExportLineReports();

  return (
    <Button
      disabled={isPending}
      onClick={() => mutate({ invoiceId, lineId, lineSeq })}
      type="button"
      variant="outline"
    >
      {isPending ? <Loader2 className="animate-spin" /> : <Download />}
      {t('Pages.Billing.Invoices.Drilldown.export')}
    </Button>
  );
}
