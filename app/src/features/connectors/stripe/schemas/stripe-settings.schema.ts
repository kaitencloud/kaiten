import { z } from 'zod';
import { STRIPE_TAX_BEHAVIORS } from '../constants';
import type { StripeSettings } from '../utils/stripe-settings';

/** The shape of a restricted key: the connector refuses any other. */
export const STRIPE_KEY_PATTERN = /^rk_(live|test)_[A-Za-z0-9]+$/;

const ERRORS = 'Pages.Integrations.Connectors.Stripe.Settings.Errors';

/** Why a key is not a restricted one, in the words of the form. */
export function getKeyErrorKey(key: string): string | undefined {
  if (STRIPE_KEY_PATTERN.test(key)) {
    return undefined;
  }
  if (key.startsWith('sk_')) {
    return `${ERRORS}.secretKey`;
  }
  if (key.startsWith('pk_')) {
    return `${ERRORS}.publishableKey`;
  }

  return `${ERRORS}.keyFormat`;
}

/**
 * What the form of the connector edits. The settings of a connector are not
 * described by the contract (it takes a free-form object checked against the schema
 * the connector registers), so the schema is the form's own, and says what that
 * schema says: a restricted key, two options and a choice of two.
 *
 * The key is write-only. When one is on file, leaving the field empty keeps it.
 */
export const createStripeSettingsSchema = (keyOnFile: boolean) =>
  z.object({
    autoFinalize: z.boolean(),
    automaticTax: z.boolean(),
    stripeSecretKey: z.string().superRefine((key, context) => {
      const trimmed = key.trim();
      if (trimmed === '') {
        if (!keyOnFile) {
          context.addIssue({
            code: 'custom',
            message: `${ERRORS}.keyRequired`,
          });
        }

        return;
      }
      const error = getKeyErrorKey(trimmed);
      if (error) {
        context.addIssue({ code: 'custom', message: error });
      }
    }),
    taxBehavior: z.enum(STRIPE_TAX_BEHAVIORS),
  });

export type StripeSettingsFormValues = z.infer<
  ReturnType<typeof createStripeSettingsSchema>
>;

/** The form as it opens: the options as they are stored, and no key, since none is ever read back. */
export const stripeSettingsToFormValues = (
  settings: StripeSettings,
): StripeSettingsFormValues => ({
  autoFinalize: settings.autoFinalize,
  automaticTax: settings.automaticTax,
  stripeSecretKey: '',
  taxBehavior: settings.taxBehavior,
});

/**
 * The body of the save: the options, and the key only when one was typed. A key left
 * out keeps the one stored, which is how the API keeps a secret from ever being sent
 * back and forth.
 */
export const stripeSettingsFormValuesToBody = (
  values: StripeSettingsFormValues,
): { settings: Record<string, boolean | string> } => {
  const key = values.stripeSecretKey.trim();

  return {
    settings: {
      autoFinalize: values.autoFinalize,
      automaticTax: values.automaticTax,
      ...(key ? { stripeSecretKey: key } : {}),
      taxBehavior: values.taxBehavior,
    },
  };
};

/**
 * Where a refusal of the API is shown on the form: on the field it names. Stripe
 * rejecting the key locates it as `body.settings.stripeSecretKey` and says the
 * reason in its `detail`; a settings schema failure locates nothing, and shows above
 * the button.
 */
export const STRIPE_SETTINGS_REFUSAL_FIELDS = {
  byCode: {
    'UpdateConnectorSettings.CredentialsRejected': 'stripeSecretKey',
  },
  byLocation: {
    'settings.autoFinalize': 'autoFinalize',
    'settings.automaticTax': 'automaticTax',
    'settings.stripeSecretKey': 'stripeSecretKey',
    'settings.taxBehavior': 'taxBehavior',
  },
} as const;
