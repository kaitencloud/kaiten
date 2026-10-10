import { CloudDownload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
 * and Kaiten has not read the payment yet, the refusal says so, and the dialog reads the
 * invoice from Stripe at once: the invoice then reads as paid, there is nothing left to
 * void, and the dialog closes on a word that says why. Only when that read fails does the
 * dialog stay, with the refusal and a button to read the invoice again.
 */
export function VoidDialog({ invoice, onClose }: VoidDialogProps) {
  const { t } = useTranslation();
  const { sync, voidInvoice } = useInvoiceMutations(invoice.id);
  const [paidAtProvider, setPaidAtProvider] = useState(false);
  const base = 'Pages.Billing.Invoices.Detail.Void.PaidAtProvider';

  async function submit(reason: string) {
    const path = { invoiceId: invoice.id };
    let refused: unknown;

    try {
      return await voidInvoice.mutateAsync({
        body: voidValuesToBody({ reason }),
        path,
      });
    } catch (error) {
      if (!isPaidAtProviderRefusal(error)) {
        throw error;
      }
      refused = error;
    }

    // The customer paid at Stripe, so there is nothing to void: the payment is what
    // Kaiten has not read yet, and reading it settles the invoice.
    try {
      const read = await sync.mutateAsync({ path });
      if (read.status === 'PAID') {
        toast.info(t(`${base}.notVoided`));
      }

      return read;
    } catch {
      // The read said why it failed, as a toast: the refusal stays, with a way to read again.
      setPaidAtProvider(true);
      throw refused;
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
          <AlertTitle>{t(`${base}.title`)}</AlertTitle>
          <AlertDescription>
            <p>{t(`${base}.description`)}</p>
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
              {t(`${base}.sync`)}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </ReasonDialog>
  );
}
