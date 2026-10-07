import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { createFormSubmitHandler } from '@/hooks/form';
import { useBillingActionForm } from '../../hooks';
import { REASON_MAX_LENGTH } from '../../schemas/invoice-reason';
import { BillingActionDialog } from '../action-dialog';

type ReasonDialogProps = {
  /** What the person is told besides the description: what will happen, and to what. */
  children?: ReactNode;
  confirmLabel: string;
  /** Colors the confirmation as the destructive action it is. */
  destructive?: boolean;
  description: string;
  fieldDescription?: string;
  fieldLabel: string;
  onClose: () => void;
  /** Asks the API: with the reason typed, trimmed. It throws what the API refused with. */
  onSubmit: (reason: string) => Promise<unknown>;
  /** The schema of the form: the generated body, with a reason of one to five hundred characters. */
  schema: z.ZodType<{ reason: string }, { reason: string }>;
  title: string;
};

/**
 * The dialog of an audited action that asks for a reason: releasing a hold,
 * writing an invoice off, voiding it. The confirmation stays disabled until the
 * reason is there, since the API requires one and keeps it with who gave it. A
 * refusal of the API is shown in the dialog, which stays open with what was
 * typed: nothing was changed, and it can be sent again.
 */
export function ReasonDialog({
  children,
  confirmLabel,
  description,
  destructive,
  fieldDescription,
  fieldLabel,
  onClose,
  onSubmit,
  schema,
  title,
}: ReasonDialogProps) {
  const { t } = useTranslation();
  const { failure, form, formId, retry } = useBillingActionForm({
    defaultValues: { reason: '' },
    onClose,
    request: ({ reason }) => onSubmit(reason.trim()),
    schema,
  });

  return (
    <form.AppForm>
      <BillingActionDialog
        confirm={
          <form.SubmitButton
            form={formId}
            label={confirmLabel}
            variant={destructive ? 'destructive' : 'default'}
          />
        }
        description={description}
        failure={failure}
        loadingFields={1}
        onClose={onClose}
        onRetry={retry}
        title={title}
      >
        {children}
        <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="reason">
            {(field) => (
              <field.TextAreaField
                description={
                  fieldDescription ??
                  t('Features.Billing.Reason.description', {
                    max: REASON_MAX_LENGTH,
                  })
                }
                label={fieldLabel}
                required
              />
            )}
          </form.AppField>
        </form>
      </BillingActionDialog>
    </form.AppForm>
  );
}
