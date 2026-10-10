import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { ReasonDialog } from '@/domains/billing';
import { useInvoiceMutations } from '../../hooks';
import {
  writeOffFormSchema,
  writeOffValuesToBody,
} from '../../schemas/write-off.schema';

type WriteOffDialogProps = {
  invoice: Invoice;
  onClose: () => void;
};

/**
 * Gives up collecting an invoice: it becomes uncollectible, which is final. A
 * handoff still pending stays so, and the system reading the queue sees the new
 * status. The reason is required.
 */
export function WriteOffDialog({ invoice, onClose }: WriteOffDialogProps) {
  const { t } = useTranslation();
  const { writeOff } = useInvoiceMutations(invoice.id);

  return (
    <ReasonDialog
      confirmLabel={t('Pages.Billing.Invoices.Detail.WriteOff.confirm')}
      description={t('Pages.Billing.Invoices.Detail.WriteOff.description')}
      destructive
      fieldLabel={t('Pages.Billing.Invoices.Detail.WriteOff.reason')}
      onClose={onClose}
      onSubmit={(reason) =>
        writeOff.mutateAsync({
          body: writeOffValuesToBody({ reason }),
          path: { invoiceId: invoice.id },
        })
      }
      schema={writeOffFormSchema}
      title={t('Pages.Billing.Invoices.Detail.WriteOff.title')}
    />
  );
}
