import { CloudDownload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isPaidAtProviderRefusal, ReasonDialog } from '@/domains/billing';
import { useInvoiceMutations } from '../../hooks';
import { voidFormSchema, voidValuesToBody } from '../../schemas/void.schema';

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
 *
 * The API never voids an invoice its customer has paid. When Stripe reports it paid
 * and Kaiten has not read the payment yet, the refusal says so, and the dialog offers
 * to read the invoice from Stripe instead: the invoice then reads as paid, and there
 * is nothing left to void.
 */
export function VoidDialog({ invoice, onClose }: VoidDialogProps) {
  const { t } = useTranslation();
  const { sync, voidInvoice } = useInvoiceMutations(invoice.id);
  const [paidAtProvider, setPaidAtProvider] = useState(false);

  async function submit(reason: string) {
    try {
      return await voidInvoice.mutateAsync({
        body: voidValuesToBody({ reason }),
        path: { invoiceId: invoice.id },
      });
    } catch (error) {
      setPaidAtProvider(isPaidAtProviderRefusal(error));
      throw error;
    }
  }

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
      onSubmit={submit}
      schema={voidFormSchema}
      title={t('Pages.Billing.Invoices.Detail.Void.title')}
    >
      {paidAtProvider ? (
        <Alert data-testid="void-paid-at-provider">
          <CloudDownload />
          <AlertTitle>
            {t('Pages.Billing.Invoices.Detail.Void.PaidAtProvider.title')}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t(
                'Pages.Billing.Invoices.Detail.Void.PaidAtProvider.description',
              )}
            </p>
            <Button
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(
                  { path: { invoiceId: invoice.id } },
                  { onSuccess: onClose },
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {t('Pages.Billing.Invoices.Detail.Void.PaidAtProvider.sync')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </ReasonDialog>
  );
}
