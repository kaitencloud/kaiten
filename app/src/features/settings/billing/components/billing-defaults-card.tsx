import { Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingSettings } from '@/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  placeRefusalOnFields,
  ProblemAlert,
  useActionAccess,
  useBillingCapabilities,
} from '@/domains/billing';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SettingsCardHeader } from '../../components/settings-card-header';
import { useUpdateBillingSettings } from '../hooks/use-update-billing-settings';
import {
  BILLING_SETTINGS_REFUSAL_FIELDS,
  billingSettingsFormSchema,
  billingSettingsFormValuesToBody,
  billingSettingsToFormValues,
} from '../schemas/billing-settings.schema';
import { BillingDefaultsFields } from './billing-defaults-fields';

type BillingDefaultsCardProps = {
  /** What the organization has now. */
  settings: BillingSettings;
};

/**
 * The defaults of the organization: how an invoice is collected, how long it is
 * due, and whether the invoices of a payment provider also enter the handoff queue.
 * A subscription that names none of its own takes them, from the invoices issued
 * from the save on: an invoice already issued keeps the terms it was issued with.
 * The save replaces the three, and the form opens again on what the API kept.
 *
 * A session that may read the defaults and not change them sees them, and no way to
 * save. Until the scopes of the session are known it is neither: the fields wait,
 * disabled, and the card does not claim to be read-only. A refusal is shown on its
 * field when it is about one, above the button otherwise, and leaves what was typed.
 */
export function BillingDefaultsCard({ settings }: BillingDefaultsCardProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { allowed: mayUpdate, isPending: isReadingScopes } =
    useActionAccess('settings.update');
  const { has } = useBillingCapabilities();
  const update = useUpdateBillingSettings();
  const [failure, setFailure] = useState<unknown>(null);

  const form = useAppForm({
    defaultValues: billingSettingsToFormValues(settings),
    listeners: {
      onChange: () => setFailure(null),
    },
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        const saved = await update.mutateAsync({
          body: billingSettingsFormValuesToBody(value),
        });
        // The form opens again on what the API kept, so that it is not "changed".
        formApi.reset(billingSettingsToFormValues(saved));
      } catch (error) {
        if (
          !placeRefusalOnFields(formApi, error, BILLING_SETTINGS_REFUSAL_FIELDS)
        ) {
          setFailure(error);
        }
      }
    },
    validators: { onChange: billingSettingsFormSchema },
  });

  return (
    <Card data-testid="billing-defaults">
      <SettingsCardHeader
        description={t('Pages.Settings.Billing.Defaults.description')}
        icon={dataModelIcons.subscription}
        title={t('Pages.Settings.Billing.Defaults.title')}
      />
      <form.AppForm>
        <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <CardContent className="space-y-5">
            {mayUpdate || isReadingScopes ? null : (
              <Alert data-testid="billing-defaults-read-only">
                <AlertDescription>
                  {t('Pages.Settings.Billing.Defaults.readOnly')}
                </AlertDescription>
              </Alert>
            )}
            <BillingDefaultsFields
              canChargeAutomatically={has('chargeAutomatically')}
              disabled={!mayUpdate || update.isPending}
              form={form}
              showHandoffStripeInvoices={has('stripe')}
            />
            {failure ? (
              <ProblemAlert
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
          </CardContent>
          {mayUpdate ? (
            <CardFooter className="justify-end">
              {/* The button is loaded on demand: it suspends the first time, and
                  without a boundary of its own the whole page gives way to the
                  route's loading screen while it does. */}
              <Suspense fallback={null}>
                <form.SubmitButton
                  form={formId}
                  label={t('Pages.Settings.Billing.Defaults.save')}
                />
              </Suspense>
            </CardFooter>
          ) : null}
        </form>
      </form.AppForm>
    </Card>
  );
}
