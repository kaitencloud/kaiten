import { describe, expect, it } from 'vite-plus/test';
import {
  createStripeSettingsSchema,
  getKeyErrorKey,
  STRIPE_KEY_PATTERN,
  STRIPE_SETTINGS_REFUSAL_FIELDS,
  stripeSettingsFormValuesToBody,
  stripeSettingsToFormValues,
  type StripeSettingsFormValues,
} from './stripe-settings.schema';

const ERRORS = 'Pages.Integrations.Connectors.Stripe.Settings.Errors';

const values = (
  overrides: Partial<StripeSettingsFormValues> = {},
): StripeSettingsFormValues => ({
  autoFinalize: true,
  automaticTax: false,
  stripeSecretKey: 'rk_test_key',
  taxBehavior: 'EXCLUSIVE',
  ...overrides,
});

const messagesOf = (
  keyOnFile: boolean,
  overrides: Partial<StripeSettingsFormValues>,
) => {
  const result = createStripeSettingsSchema(keyOnFile).safeParse(
    values(overrides),
  );

  return result.success ? [] : result.error.issues.map(({ message }) => message);
};

describe('the key of the Stripe connector', () => {
  it.each(['rk_test_key', 'rk_live_Key9'])(
    'accepts the restricted key %s',
    (key) => {
      expect(STRIPE_KEY_PATTERN.test(key)).toBe(true);
      expect(getKeyErrorKey(key)).toBeUndefined();
    },
  );

  it('refuses a secret key, which would give Kaiten far more than it needs, and says why', () => {
    expect(getKeyErrorKey('sk_live_key')).toBe(`${ERRORS}.secretKey`);
    expect(getKeyErrorKey('sk_test_key')).toBe(`${ERRORS}.secretKey`);
  });

  it('refuses a publishable key, which cannot create an invoice', () => {
    expect(getKeyErrorKey('pk_live_key')).toBe(`${ERRORS}.publishableKey`);
  });

  it.each(['rk_prod_key', 'rk_test_', 'rk_test_k ey', 'hello'])(
    'refuses %s as not shaped like a restricted key',
    (key) => {
      expect(getKeyErrorKey(key)).toBe(`${ERRORS}.keyFormat`);
    },
  );
});

describe('the form of the Stripe connector', () => {
  it('asks for a key when none is stored', () => {
    expect(messagesOf(false, { stripeSecretKey: '' })).toEqual([
      `${ERRORS}.keyRequired`,
    ]);
    expect(messagesOf(false, { stripeSecretKey: '   ' })).toEqual([
      `${ERRORS}.keyRequired`,
    ]);
  });

  it('lets the key stay empty when one is stored, which keeps it', () => {
    expect(messagesOf(true, { stripeSecretKey: '' })).toEqual([]);
  });

  it('still checks a key typed over the stored one', () => {
    expect(messagesOf(true, { stripeSecretKey: 'sk_live_key' })).toEqual([
      `${ERRORS}.secretKey`,
    ]);
    expect(messagesOf(true, { stripeSecretKey: 'rk_live_key' })).toEqual([]);
  });

  it('accepts the key with the spaces a paste leaves around it', () => {
    expect(messagesOf(false, { stripeSecretKey: '  rk_test_key\n' })).toEqual(
      [],
    );
  });

  it('opens on the options as they are stored and on no key, since none is ever read back', () => {
    expect(
      stripeSettingsToFormValues({
        autoFinalize: false,
        automaticTax: true,
        keyOnFile: true,
        taxBehavior: 'INCLUSIVE',
      }),
    ).toEqual({
      autoFinalize: false,
      automaticTax: true,
      stripeSecretKey: '',
      taxBehavior: 'INCLUSIVE',
    });
  });
});

describe('the body of the save', () => {
  it('carries the key that was typed, trimmed, with the options', () => {
    expect(
      stripeSettingsFormValuesToBody(
        values({ stripeSecretKey: ' rk_live_key ', taxBehavior: 'INCLUSIVE' }),
      ),
    ).toEqual({
      settings: {
        autoFinalize: true,
        automaticTax: false,
        stripeSecretKey: 'rk_live_key',
        taxBehavior: 'INCLUSIVE',
      },
    });
  });

  it('leaves the key out when none was typed, so that the stored one is kept', () => {
    const { settings } = stripeSettingsFormValuesToBody(
      values({ stripeSecretKey: '  ' }),
    );

    expect(settings).toEqual({
      autoFinalize: true,
      automaticTax: false,
      taxBehavior: 'EXCLUSIVE',
    });
    expect('stripeSecretKey' in settings).toBe(false);
  });
});

describe('where a refusal is shown', () => {
  it('puts a key that Stripe rejects on the key field', () => {
    expect(
      STRIPE_SETTINGS_REFUSAL_FIELDS.byCode[
        'UpdateConnectorSettings.CredentialsRejected'
      ],
    ).toBe('stripeSecretKey');
  });

  it('names a field of the form for every member of the settings, by where the API locates it', () => {
    const { byLocation } = STRIPE_SETTINGS_REFUSAL_FIELDS;

    expect(Object.keys(byLocation).sort()).toEqual([
      'settings.autoFinalize',
      'settings.automaticTax',
      'settings.stripeSecretKey',
      'settings.taxBehavior',
    ]);
    expect(Object.values(byLocation).sort()).toEqual([
      'autoFinalize',
      'automaticTax',
      'stripeSecretKey',
      'taxBehavior',
    ]);
  });
});
