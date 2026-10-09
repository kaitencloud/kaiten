import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import { BillingActionDialog, useBillingActionForm } from '@/domains/billing';
import { createFormSubmitHandler } from '@/hooks/form';
import { useInvoiceMutations } from '../../hooks';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from '../../schemas/external-reference';
import {
  initialMarkPaidValues,
  MARK_PAID_REFUSAL_FIELDS,
  markPaidFormSchema,
  markPaidValuesToBody,
} from '../../schemas/mark-paid.schema';

type MarkPaidDialogProps = {
  invoice: Invoice;
  onClose: () => void;
};

/**
 * Records that an invoice ready to bill was paid. The number the accounting
 * system gave it comes first, since it is what the invoice is found by there; the
 * note carries the payment's own reference and is kept only in the event. Marking
 * an invoice paid acknowledges what waited in the handoff queue, with that
 * number. The time is read as UTC, as every billing time is.
 */
export function MarkPaidDialog({ invoice, onClose }: MarkPaidDialogProps) {
  const { t } = useTranslation();
  const { markPaid } = useInvoiceMutations(invoice.id);
  const { failure, form, formId, retry } = useBillingActionForm({
    defaultValues: initialMarkPaidValues,
    fields: MARK_PAID_REFUSAL_FIELDS,
    onClose,
    request: (values) =>
      markPaid.mutateAsync({
        body: markPaidValuesToBody(values),
        path: { invoiceId: invoice.id },
      }),
    schema: markPaidFormSchema,
  });

  return (
    <form.AppForm>
      <BillingActionDialog
        confirm={
          <form.SubmitButton
            allowPristine
            form={formId}
            label={t('Pages.Billing.Invoices.Detail.MarkPaid.confirm')}
          />
        }
        description={t(
          invoice.handoffStatus === 'PENDING'
            ? 'Pages.Billing.Invoices.Detail.MarkPaid.descriptionPending'
            : 'Pages.Billing.Invoices.Detail.MarkPaid.description',
        )}
        failure={failure}
        loadingFields={3}
        onClose={onClose}
        onRetry={retry}
        title={t('Pages.Billing.Invoices.Detail.MarkPaid.title')}
      >
        <form
          className="space-y-4"
          id={formId}
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
        >
          <form.AppField name="externalReference">
            {(field) => (
              <field.TextField
                description={t(
                  'Pages.Billing.Invoices.Detail.MarkPaid.referenceHint',
                  { max: EXTERNAL_REFERENCE_MAX_LENGTH },
                )}
                label={t('Pages.Billing.Invoices.Detail.MarkPaid.reference')}
              />
            )}
          </form.AppField>
          <form.AppField name="paidAt">
            {(field) => (
              <field.DateTimeField
                description={t(
                  'Pages.Billing.Invoices.Detail.MarkPaid.paidAtHint',
                )}
                label={t('Pages.Billing.Invoices.Detail.MarkPaid.paidAt')}
              />
            )}
          </form.AppField>
          <form.AppField name="note">
            {(field) => (
              <field.TextAreaField
                description={t(
                  'Pages.Billing.Invoices.Detail.MarkPaid.noteHint',
                )}
                label={t('Pages.Billing.Invoices.Detail.MarkPaid.note')}
              />
            )}
          </form.AppField>
        </form>
      </BillingActionDialog>
    </form.AppForm>
  );
}
