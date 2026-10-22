import { useStore } from '@tanstack/react-form';
import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useBillingProvider } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { publishableKeyFormOpts } from '../../schemas';
import { canOpenAnonymousCheckout } from '../../utils/turnstile';
import { TurnstileSecretField } from './turnstile-secret-field';

const BASE = 'Pages.Integrations.PublishableKeys.Form';

/**
 * Whether this deployment has no Vault to store a Turnstile secret in. The API has no
 * member of its own for it: it says so in the entry of the payment provider in the billing
 * capabilities (`VAULT_NOT_CONFIGURED`), which keeps the Stripe key in the same Vault.
 * A deployment that answers anything else, or nothing yet, is taken to have one, and the
 * API's refusal (`.VaultNotConfigured`) tells otherwise.
 */
function useVaultMissing() {
  const { standing } = useBillingProvider('STRIPE');

  return (
    standing.state === 'unavailable' &&
    standing.reason === 'VAULT_NOT_CONFIGURED'
  );
}

/**
 * What a key needs to open the anonymous checkout, which lets a visitor with no account
 * create a customer: the switch, and the Turnstile site key and secret that guard it. The
 * switch cannot be turned on until the key will hold both, since the API refuses a key
 * that opens the checkout without them; one that is already on can always be turned off.
 */
export const AnonymousCheckoutFields = withForm({
  ...publishableKeyFormOpts,
  render: function AnonymousCheckoutFieldsRender({ form }) {
    const { t } = useTranslation();
    const titleId = useId();
    const vaultMissing = useVaultMissing();
    // A switch left on whose site key or secret was just taken away is what the person
    // must mend next: the message says so at once, not once the switch is touched.
    const mustTurnOff = useStore(
      form.store,
      (state) =>
        state.values.anonymousCheckout &&
        !canOpenAnonymousCheckout(state.values),
    );

    useEffect(() => {
      if (mustTurnOff) {
        form.setFieldMeta('anonymousCheckout', (meta) => ({
          ...meta,
          isTouched: true,
        }));
      }
    }, [form, mustTurnOff]);

    return (
      <section
        aria-labelledby={titleId}
        className="space-y-5 rounded-lg border bg-card p-4"
        data-testid="anonymous-checkout-fields"
      >
        <div className="space-y-1">
          <h3 className="text-sm font-medium" id={titleId}>
            {t(`${BASE}.Anonymous.title`)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(`${BASE}.Anonymous.description`)}
          </p>
        </div>
        <form.Subscribe
          selector={(state) =>
            !state.values.anonymousCheckout &&
            !canOpenAnonymousCheckout(state.values)
          }
        >
          {(cannotTurnOn) => (
            <form.AppField name="anonymousCheckout">
              {(field) => (
                <field.SwitchField
                  description={t(`${BASE}.Descriptions.anonymousCheckout`)}
                  disabled={cannotTurnOn}
                  label={t(`${BASE}.Labels.anonymousCheckout`)}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="turnstileSiteKey">
          {(field) => (
            <field.TextField
              description={t(`${BASE}.Descriptions.turnstileSiteKey`)}
              label={t(`${BASE}.Labels.turnstileSiteKey`)}
              placeholder={t(`${BASE}.Placeholders.turnstileSiteKey`)}
            />
          )}
        </form.AppField>
        <TurnstileSecretField form={form} vaultMissing={vaultMissing} />
      </section>
    );
  },
});
