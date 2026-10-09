import { Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  placeRefusalOnFields,
  type ProviderStanding,
  ProblemAlert,
  useActionAccess,
} from '@/domains/billing';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useStripeConnector } from '../hooks';
import {
  createStripeSettingsSchema,
  STRIPE_SETTINGS_REFUSAL_FIELDS,
  stripeSettingsToFormValues,
} from '../schemas/stripe-settings.schema';
import { type StripeSettings } from '../utils/stripe-settings';
import { StripeSettingsFields } from './stripe-settings-fields';

type StripeSettingsCardProps = {
  /** Whether the connector is on, and which account it reaches; none while that is not known yet. */
  standing: ProviderStanding | undefined;
  /** What is stored, key redacted. */
  settings: StripeSettings;
};

/**
 * The connection: the restricted key and how invoices are pushed to Stripe. The
 * key is write-only: it is typed once, stored in Vault and never read back, so the
 * field opens empty and says there is one on file, and an empty field keeps it. A save
 * also connects. A refusal is shown where the person is looking: Stripe rejecting the
 * key on the field, an account that changed or a Stripe that cannot be reached above
 * the button, in the API's own words, with what was typed kept.
 *
 * Nothing can be saved where Stripe cannot be connected (no Vault, a plan that
 * leaves it out): the button is there and off, beside the notice that says why. A
 * session that may read the settings and not write them sees them with a notice and no
 * button.
 */
export function StripeSettingsCard({
  settings,
  standing,
}: StripeSettingsCardProps) {
  const { t } = useTranslation();
  const formId = useId();
  const connector = useStripeConnector();
  const { allowed: mayWrite, isPending: isReadingScopes } = useActionAccess(
    'connector.settings.update',
  );
  const [failure, setFailure] = useState<unknown>(null);
  const connected = standing?.state === 'connected';
  const blocked =
    !standing ||
    standing.state === 'unavailable' ||
    standing.state === 'unlisted';
  const Icon = dataModelIcons.billing;

  const form = useAppForm({
    defaultValues: stripeSettingsToFormValues(settings),
    listeners: { onChange: () => setFailure(null) },
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        await connector.save(value);
        toast.success(
          t(
            connected
              ? 'Pages.Integrations.Connectors.Stripe.Toast.saved'
              : 'Pages.Integrations.Connectors.Stripe.Toast.connected',
          ),
        );
        // The key was typed once: the form opens again on the options, with none.
        formApi.reset({ ...value, stripeSecretKey: '' });
      } catch (error) {
        if (
          !placeRefusalOnFields(formApi, error, STRIPE_SETTINGS_REFUSAL_FIELDS)
        ) {
          setFailure(error);
        }
      }
    },
    validators: { onChange: createStripeSettingsSchema(settings.keyOnFile) },
  });

  const readOnly = !mayWrite && !isReadingScopes;

  return (
    <Card data-testid="stripe-settings">
      <form.AppForm>
        <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary-subtle-foreground" />
              <div className="space-y-1">
                <h2 className="leading-none font-semibold">
                  {t('Pages.Integrations.Connectors.Stripe.Settings.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Pages.Integrations.Connectors.Stripe.Settings.description',
                  )}
                </p>
              </div>
            </div>
            {readOnly ? (
              <Alert data-testid="stripe-read-only">
                <AlertDescription>
                  {t('Pages.Integrations.Connectors.Stripe.Settings.readOnly')}
                </AlertDescription>
              </Alert>
            ) : null}
            <StripeSettingsFields
              disabled={!mayWrite || blocked || connector.isSaving}
              form={form}
              keyOnFile={settings.keyOnFile}
              standing={standing}
            />
            {failure ? (
              <ProblemAlert
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
          </CardContent>
          {mayWrite ? (
            <CardFooter className="mt-5 justify-end">
              {/* The button is loaded on demand: it suspends the first time, and
                  without a boundary of its own the whole page gives way to the
                  route's loading screen while it does. */}
              <Suspense fallback={null}>
                <form.SubmitButton
                  allowPristine={!connected && settings.keyOnFile}
                  disabled={blocked}
                  form={formId}
                  label={t(
                    connected
                      ? 'Pages.Integrations.Connectors.Stripe.Settings.save'
                      : settings.keyOnFile
                        ? 'Pages.Integrations.Connectors.Stripe.Settings.reconnect'
                        : 'Pages.Integrations.Connectors.Stripe.Settings.connect',
                  )}
                />
              </Suspense>
            </CardFooter>
          ) : null}
        </form>
      </form.AppForm>
    </Card>
  );
}
