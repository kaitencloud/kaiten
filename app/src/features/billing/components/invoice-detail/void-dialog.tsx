import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { useInvoiceMutations } from '../../hooks';
import { voidFormSchema, voidValuesToBody } from '../../schemas/void.schema';
import { ReasonDialog } from './reason-dialog';

type VoidDialogProps = {
  invoice: Invoice;
  onClose: () => void;
};

/**
 * Voids an invoice that is not settled. Without a payment provider the void is
 * local: the invoice leaves the boundary it billed, which a recompose can then
 * fill, and a pending handoff stays pending with the void in its payload. An
 * invoice a provider collects is voided there first, which is said where it
 * applies.
 */
export function VoidDialog({ invoice, onClose }: VoidDialogProps) {
  const { t } = useTranslation();
  const { voidInvoice } = useInvoiceMutations(invoice.id);

  return (
    <ReasonDialog
      confirmLabel={t('Pages.Billing.Invoices.Detail.Void.confirm')}
      description={t(
        invoice.providerKind === 'NOOP'
          ? 'Pages.Billing.Invoices.Detail.Void.descriptionNoop'
          : 'Pages.Billing.Invoices.Detail.Void.descriptionProvider',
      )}
      destructive
      fieldLabel={t('Pages.Billing.Invoices.Detail.Void.reason')}
      onClose={onClose}
      onSubmit={(reason) =>
        voidInvoice.mutateAsync({
          body: voidValuesToBody({ reason }),
          path: { invoiceId: invoice.id },
        })
      }
      schema={voidFormSchema}
      title={t('Pages.Billing.Invoices.Detail.Void.title')}
    />
  );
}
