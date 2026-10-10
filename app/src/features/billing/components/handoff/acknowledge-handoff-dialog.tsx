import { useTranslation } from 'react-i18next';
import type { QueuedInvoice } from '@/api-client';
import {
  BillingActionDialog,
  formatInstant,
  formatUtcDate,
  getInvoiceKindLabelKey,
  isHandoffLeased,
  Money,
  useBillingActionForm,
} from '@/domains/billing';
import { createFormSubmitHandler } from '@/hooks/form';
import { useAcknowledgeHandoff } from '../../hooks';
import {
  ACKNOWLEDGE_REFUSAL_FIELDS,
  acknowledgeHandoffFormSchema,
  acknowledgeHandoffValuesToBody,
  initialAcknowledgeHandoffValues,
} from '../../schemas/acknowledge-handoff.schema';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from '../../schemas/external-reference';

type AcknowledgeHandoffDialogProps = {
  invoice: QueuedInvoice;
  onClose: () => void;
};

/**
 * Records by hand that the accounting system booked an invoice of the queue, under
 * the number it gave it. The number is optional, and is what the invoice is found by
 * afterwards. There is no lease to give: this is not the consumer that claimed the
 * invoice, so when one holds it the dialog says so, and the person acknowledges only
 * what they booked themselves. The API refuses a number other than the one the
 * invoice was already booked under, and says so here, on the field.
 */
export function AcknowledgeHandoffDialog({
  invoice,
  onClose,
}: AcknowledgeHandoffDialogProps) {
  const { i18n, t } = useTranslation();
  const acknowledge = useAcknowledgeHandoff();
  const { failure, form, formId, retry } = useBillingActionForm({
    defaultValues: initialAcknowledgeHandoffValues,
    fields: ACKNOWLEDGE_REFUSAL_FIELDS,
    onClose,
    request: (values) =>
      acknowledge.mutateAsync({
        body: acknowledgeHandoffValuesToBody(values),
        path: { invoiceId: invoice.id },
      }),
    schema: acknowledgeHandoffFormSchema,
  });

  return (
    <form.AppForm>
      <BillingActionDialog
        confirm={
          <form.SubmitButton
            allowPristine
            form={formId}
            label={t('Pages.Billing.Handoff.Acknowledge.confirm')}
          />
        }
        description={t('Pages.Billing.Handoff.Acknowledge.description')}
        failure={failure}
        loadingFields={1}
        onClose={onClose}
        onRetry={retry}
        title={t('Pages.Billing.Handoff.Acknowledge.title')}
      >
        <p className="text-sm" data-testid="acknowledge-handoff-invoice">
          <span className="font-medium">{invoice.customerName}</span>
          {' · '}
          {t(getInvoiceKindLabelKey(invoice.kind))}{' '}
          {formatUtcDate(invoice.boundaryAt, i18n.language)}
          {' · '}
          <Money amount={invoice.total} currency={invoice.currency} />
        </p>
        {isHandoffLeased(invoice.handoff) ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="acknowledge-handoff-leased"
          >
            {t('Pages.Billing.Handoff.Acknowledge.leased', {
              date: formatInstant(invoice.handoff.leasedUntil, i18n.language),
            })}
          </p>
        ) : null}
        <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="externalReference">
            {(field) => (
              <field.TextField
                description={t(
                  'Pages.Billing.Handoff.Acknowledge.referenceHint',
                  { max: EXTERNAL_REFERENCE_MAX_LENGTH },
                )}
                label={t('Pages.Billing.Handoff.Acknowledge.reference')}
              />
            )}
          </form.AppField>
        </form>
      </BillingActionDialog>
    </form.AppForm>
  );
}
