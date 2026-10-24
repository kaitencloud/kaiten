import { describe, expect, it } from 'vite-plus/test';
import { zNewInstanceAddon } from '@/api-client/zod.gen';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { MAX_ADDON_QUANTITY } from '../../utils/instance-addons.utils';
import { attachAddonFormSchema } from '../attach-addon.schema';

const messages = (locale: typeof en | typeof fr) =>
  locale.Pages.Customers.Instances.Detail.Billing.Addons.Attach.Errors;

describe('the most units a quantity can carry', () => {
  it('is the most the contract carries: the generated schema accepts it and refuses one more', () => {
    const quantity = zNewInstanceAddon.shape.quantity;

    expect(quantity.safeParse(MAX_ADDON_QUANTITY).success).toBe(true);
    expect(quantity.safeParse(MAX_ADDON_QUANTITY + 1).success).toBe(false);
  });

  it('is the one the form refuses beyond', () => {
    const form = (quantity: number) =>
      attachAddonFormSchema.safeParse({ addonSlug: 'seats-v1', quantity });

    expect(form(MAX_ADDON_QUANTITY).success).toBe(true);
    expect(form(MAX_ADDON_QUANTITY + 1).success).toBe(false);
  });

  it.each([
    ['en', 'en-US', en],
    ['fr', 'fr-FR', fr],
  ] as const)(
    'is the number the %s message says, written as the language writes it',
    (_, locale, texts) => {
      expect(messages(texts).quantityLimit).toContain(
        new Intl.NumberFormat(locale).format(MAX_ADDON_QUANTITY),
      );
    },
  );
});
