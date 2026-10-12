import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Invoice } from '@/api-client';
import { ReasonDialog } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import { useInvoiceMutations } from '../../hooks';
import { voidFormSchema, voidValuesToBody } from '../../schemas/void.schema';

type VoidThenRecomposeDialogProps = {
  invoice: Invoice;
  onClose: () => void;
};

/**
 * What a recompose of an invoice that cannot be recomposed leads to: an invoice
 * that is not a held draft is never edited, it is voided and a replacement is
 * composed. The two calls are one confirmation with one reason. When the void
 * went through and the replacement did not, the invoice is void and the person is
 * told, with the page showing it, so that the recompose can be asked again from
 * there.
 */
export function VoidThenRecomposeDialog({
  invoice,
  onClose,
}: VoidThenRecomposeDialogProps) {
  const { t } = useTranslation();
  const { recompose, voidInvoice } = useInvoiceMutations(invoice.id);

  async function voidThenRecompose(reason: string) {
    await voidInvoice.mutateAsync({
      body: voidValuesToBody({ reason }),
      path: { invoiceId: invoice.id },
    });
    try {
      await recompose.mutateAsync({ path: { invoiceId: invoice.id } });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <ReasonDialog
      confirmLabel={t(
        'Pages.Billing.Invoices.Detail.VoidThenRecompose.confirm',
      )}
      description={t(
        'Pages.Billing.Invoices.Detail.VoidThenRecompose.description',
      )}
      destructive
      fieldLabel={t('Pages.Billing.Invoices.Detail.Void.reason')}
      onClose={onClose}
      onSubmit={voidThenRecompose}
      schema={voidFormSchema}
      title={t('Pages.Billing.Invoices.Detail.VoidThenRecompose.title')}
    />
  );
}
