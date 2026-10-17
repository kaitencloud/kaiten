import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderStanding } from '@/domains/billing';
import { STRIPE_TAX_BEHAVIORS, type StripeTaxBehavior } from '../constants';
import { getKeyMode } from '../utils/stripe-settings';

// One word for each way Kaiten's amounts relate to tax: a way the connector adds
// fails the type check until it reads in both languages.
const TAX_BEHAVIOR_LABEL_KEYS = {
  EXCLUSIVE:
    'Pages.Integrations.Connectors.Stripe.Settings.TaxBehavior.EXCLUSIVE',
  INCLUSIVE:
    'Pages.Integrations.Connectors.Stripe.Settings.TaxBehavior.INCLUSIVE',
} as const satisfies Record<StripeTaxBehavior, string>;

type StripeSettingsFieldsProps = {
  disabled: boolean;
  /** The form of the card, typed by `useAppForm`. */
  form: any;
  /** A key is stored: the field says so, and an empty one keeps it. */
  keyOnFile: boolean;
  standing: ProviderStanding | undefined;
};

/**
 * The fields of the connection. The key is a password field (a secret typed once),
 * whose hint says which account the key being typed reaches, and which account the
 * stored one does when the connector is on; the options say how invoices are built
 * and pushed.
 */
export function StripeSettingsFields({
  disabled,
  form,
  keyOnFile,
  standing,
}: StripeSettingsFieldsProps) {
  const { t } = useTranslation();
  const storedMode =
    standing?.state === 'connected' && standing.livemode !== undefined
      ? standing.livemode
        ? 'live'
        : 'test'
      : undefined;

  function keyPlaceholder() {
    if (!keyOnFile) {
      return t('Pages.Integrations.Connectors.Stripe.Settings.keyPlaceholder');
    }

    return storedMode
      ? t(
          'Pages.Integrations.Connectors.Stripe.Settings.keyOnFilePlaceholder',
          {
            mode: t(`Pages.Integrations.Connectors.Stripe.Mode.${storedMode}`),
          },
        )
      : t(
          'Pages.Integrations.Connectors.Stripe.Settings.keyOnFilePlaceholderNoMode',
        );
  }

  function keyDescription(typed: string) {
    const mode = getKeyMode(typed.trim());

    return mode
      ? t('Pages.Integrations.Connectors.Stripe.Settings.keyReaches', {
          mode: t(`Pages.Integrations.Connectors.Stripe.Mode.${mode}`),
        })
      : t('Pages.Integrations.Connectors.Stripe.Settings.keyHint');
  }

  return (
    <Suspense fallback={null}>
      <form.AppField name="stripeSecretKey">
        {(field: any) => (
          <field.TextField
            description={keyDescription(String(field.state.value ?? ''))}
            disabled={disabled}
            label={t('Pages.Integrations.Connectors.Stripe.Settings.keyLabel')}
            placeholder={keyPlaceholder()}
            required={!keyOnFile}
            type="password"
          />
        )}
      </form.AppField>
      <form.AppField name="taxBehavior">
        {(field: any) => (
          <field.SelectField
            description={t(
              'Pages.Integrations.Connectors.Stripe.Settings.taxBehaviorHint',
            )}
            disabled={disabled}
            getOptionLabel={(behavior: StripeTaxBehavior) =>
              t(TAX_BEHAVIOR_LABEL_KEYS[behavior])
            }
            label={t(
              'Pages.Integrations.Connectors.Stripe.Settings.taxBehaviorLabel',
            )}
            options={STRIPE_TAX_BEHAVIORS}
          />
        )}
      </form.AppField>
      <form.AppField name="automaticTax">
        {(field: any) => (
          <field.CheckboxField
            description={t(
              'Pages.Integrations.Connectors.Stripe.Settings.automaticTaxHint',
            )}
            disabled={disabled}
            label={t(
              'Pages.Integrations.Connectors.Stripe.Settings.automaticTaxLabel',
            )}
          />
        )}
      </form.AppField>
      <form.AppField name="autoFinalize">
        {(field: any) => (
          <field.CheckboxField
            description={t(
              'Pages.Integrations.Connectors.Stripe.Settings.autoFinalizeHint',
            )}
            disabled={disabled}
            label={t(
              'Pages.Integrations.Connectors.Stripe.Settings.autoFinalizeLabel',
            )}
          />
        )}
      </form.AppField>
    </Suspense>
  );
}
