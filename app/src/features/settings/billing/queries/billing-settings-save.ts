import type { BillingSettings } from '@/api-client';
import { getBillingSettings, updateBillingSettings } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import {
  billingSettingsFormValuesToBody,
  billingSettingsToFormValues,
} from '../schemas/billing-settings.schema';

export type SaveBillingSettingsVariables = {
  /** What the form sends, built from the values it holds. */
  edited: BillingSettings;
  /** What the form opened with, built by the function that built `edited`. */
  opened: BillingSettings;
};

/**
 * Replaces the defaults of the organization without overwriting what changed
 * since the form opened. The update replaces the three members together,
 * including the one the form does not show, so saving the payment terms from an
 * old page would take back a collection method saved from another tab: the
 * settings are read again and the form's changes are applied on top of them
 * (`writeOnFresh`).
 */
export function saveBillingSettingsOnFresh({
  edited,
  opened,
}: SaveBillingSettingsVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getBillingSettings({
        ...FRESH_READ_OPTIONS,
        throwOnError: true,
      });

      return data;
    },
    restate: (settings) =>
      billingSettingsFormValuesToBody(billingSettingsToFormValues(settings)),
    write: async (body) => {
      const { data } = await updateBillingSettings({
        body,
        throwOnError: true,
      });

      return data;
    },
  });
}
