import { Mail } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Customer } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProblemAlert, useCanPerform } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { useSetBillingEmail } from '../../../../../hooks/use-set-billing-email';
import { billingEmailNoticeSchema } from '../../../../../schemas/billing-email-notice.schema';

type BillingEmailNoticeProps = {
  customer: Customer;
};

/**
 * The form that sets the address. It is a form of its own, built as every form of
 * the console is, inside the form that subscribes: a DOM `<form>` cannot hold
 * another, so it has none, and the button and the Enter key send it by hand. A
 * refusal of the API is drawn under the field in its own words and takes the
 * focus, since the field and the button were disabled while the API answered and
 * dropped it with them.
 */
function BillingEmailForm({ customer }: BillingEmailNoticeProps) {
  const { t } = useTranslation();
  const setBillingEmail = useSetBillingEmail(customer);

  const form = useAppForm({
    defaultValues: { billingEmail: '' },
    onSubmit: async ({ value }) => {
      try {
        await setBillingEmail.save(value.billingEmail);
        toast.success(
          t(
            'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.saved',
          ),
        );
      } catch {
        // The refusal is shown under the field, in the API's words.
      }
    },
    validators: { onChange: billingEmailNoticeSchema },
  });

  return (
    // The dialog is a form, and Enter here sets the address and nothing else:
    // it must not subscribe.
    <div
      className="flex flex-col items-start gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }
      }}
    >
      <Suspense fallback={null}>
        <form.AppField name="billingEmail">
          {(field) => (
            <field.TextField
              className="w-full"
              disabled={setBillingEmail.isPending}
              label={t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.label',
              )}
              placeholder={t(
                'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.placeholder',
              )}
            />
          )}
        </form.AppField>
      </Suspense>
      <Button
        disabled={setBillingEmail.isPending}
        onClick={() => void form.handleSubmit()}
        type="button"
        variant="outline"
      >
        {t(
          'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.save',
        )}
      </Button>
      {setBillingEmail.isError ? (
        <ProblemAlert
          autoFocus
          className="w-full"
          error={setBillingEmail.error}
        />
      ) : null}
    </div>
  );
}

/**
 * Said before the subscription is confirmed, when the customer has no billing
 * e-mail: its invoices carry the address for the accounting system, and sending
 * the person to another page for it would lose the dialog. It can be set here, in
 * a field of its own that does not submit the subscription, or left for later.
 * Without the scope to write customers it only says so.
 */
export function BillingEmailNotice({ customer }: BillingEmailNoticeProps) {
  const { t } = useTranslation();
  const maySet = useCanPerform('customer.updateBillingEmail');

  if (customer.billingEmail) {
    return null;
  }

  return (
    <Alert data-testid="billing-email-notice" role="group">
      <Mail />
      <AlertTitle>
        {t(
          'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.title',
          { customer: customer.name },
        )}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {t(
            'Pages.Customers.Instances.Detail.Billing.Subscribe.BillingEmail.description',
          )}
        </p>
        {maySet ? <BillingEmailForm customer={customer} /> : null}
      </AlertDescription>
    </Alert>
  );
}
