import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { ReasonDialog } from '@/domains/billing';
import { useInvoiceMutations } from '../../hooks';
import {
  releaseHoldFormSchema,
  releaseHoldValuesToBody,
} from '../../schemas/release-hold.schema';

type ReleaseHoldDialogProps = {
  invoice: Invoice;
  onClose: () => void;
};

/**
 * Accepts the figures of a held invoice as composed. It is audited: the reason
 * is required and is kept with who gave it. The invoice is issued under its own
 * provider, and the dialog says what that comes to, since the person is
 * accepting a bill the usage journal could not vouch for.
 */
export function ReleaseHoldDialog({
  invoice,
  onClose,
}: ReleaseHoldDialogProps) {
  const { t } = useTranslation();
  const { releaseHold } = useInvoiceMutations(invoice.id);

  return (
    <ReasonDialog
      confirmLabel={t('Pages.Billing.Invoices.Detail.Release.confirm')}
      description={t('Pages.Billing.Invoices.Detail.Release.description')}
      fieldDescription={t('Pages.Billing.Invoices.Detail.Release.reasonHint')}
      fieldLabel={t('Pages.Billing.Invoices.Detail.Release.reason')}
      onClose={onClose}
      onSubmit={(reason) =>
        releaseHold.mutateAsync({
          body: releaseHoldValuesToBody({ reason }),
          path: { invoiceId: invoice.id },
        })
      }
      schema={releaseHoldFormSchema}
      title={t('Pages.Billing.Invoices.Detail.Release.title')}
    >
      <p className="text-sm text-muted-foreground">
        {t('Pages.Billing.Invoices.Detail.Release.effect', {
          context: invoice.providerKind,
        })}
      </p>
    </ReasonDialog>
  );
}
