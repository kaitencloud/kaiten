import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingSettings } from '@/api-client';
import { MAX_DAYS_UNTIL_DUE } from '@/domains/billing';

type CollectionMethod = BillingSettings['defaultCollectionMethod'];

// One word for each way an invoice is collected: a way the API adds fails the
// type check until it reads in both languages.
const COLLECTION_METHOD_LABEL_KEYS = {
  CHARGE_AUTOMATICALLY:
    'Pages.Settings.Billing.Defaults.CollectionMethod.CHARGE_AUTOMATICALLY',
  SEND_INVOICE: 'Pages.Settings.Billing.Defaults.CollectionMethod.SEND_INVOICE',
} as const satisfies Record<CollectionMethod, string>;

const COLLECTION_METHODS = [
  'SEND_INVOICE',
  'CHARGE_AUTOMATICALLY',
] as const satisfies readonly CollectionMethod[];

type BillingDefaultsFieldsProps = {
  /**
   * Whether a connected provider charges by itself. It does not make the option
   * choosable here, since the API takes SEND_INVOICE alone as the default of the
   * organization: it only changes the reason given, which is then the contract.
   */
  providerCharges: boolean;
  disabled: boolean;
  form: any;
  /** Whether Stripe is connected or can be: only then is there an invoice of a provider to hand off. */
  showHandoffStripeInvoices: boolean;
};

/**
 * The three defaults a subscription takes when it names none of its own. Charging
 * automatically is listed and cannot be chosen as a default, with the reason on the
 * option, so that it is known to exist and why it is not offered: no payment
 * provider can do it, or one can and it is set on each contract. Whether to hand the invoices of a provider to the handoff queue is
 * hidden until a provider can be used here: it would be a question about nothing.
 */
export function BillingDefaultsFields({
  disabled,
  form,
  providerCharges,
  showHandoffStripeInvoices,
}: BillingDefaultsFieldsProps) {
  const { t } = useTranslation();

  const methodLabel = (method: CollectionMethod) =>
    method === 'SEND_INVOICE'
      ? t(COLLECTION_METHOD_LABEL_KEYS[method])
      : t(
          providerCharges
            ? 'Pages.Settings.Billing.Defaults.CollectionMethod.perContract'
            : 'Pages.Settings.Billing.Defaults.CollectionMethod.unavailable',
          { method: t(COLLECTION_METHOD_LABEL_KEYS[method]) },
        );

  return (
    <Suspense fallback={null}>
      <form.AppField name="defaultCollectionMethod">
        {(field: any) => (
          <field.SelectField
            description={t(
              'Pages.Settings.Billing.Defaults.Descriptions.collectionMethod',
            )}
            disabled={disabled}
            getOptionLabel={methodLabel}
            getOptionValue={(method: CollectionMethod) => method}
            isOptionDisabled={(method: CollectionMethod) =>
              method === 'CHARGE_AUTOMATICALLY'
            }
            label={t('Pages.Settings.Billing.Defaults.Labels.collectionMethod')}
            options={COLLECTION_METHODS}
          />
        )}
      </form.AppField>
      <form.AppField name="defaultDaysUntilDue">
        {(field: any) => (
          <field.NumberField
            // More than a year is refused in words, and not changed to a year.
            allowOutOfRange
            description={t(
              'Pages.Settings.Billing.Defaults.Descriptions.daysUntilDue',
            )}
            disabled={disabled}
            label={t('Pages.Settings.Billing.Defaults.Labels.daysUntilDue')}
            max={MAX_DAYS_UNTIL_DUE}
            min={0}
            required
            step={1}
          />
        )}
      </form.AppField>
      {showHandoffStripeInvoices ? (
        <form.AppField name="handoffStripeInvoices">
          {(field: any) => (
            <field.CheckboxField
              description={t(
                'Pages.Settings.Billing.Defaults.Descriptions.handoffStripeInvoices',
              )}
              disabled={disabled}
              label={t(
                'Pages.Settings.Billing.Defaults.Labels.handoffStripeInvoices',
              )}
            />
          )}
        </form.AppField>
      ) : null}
    </Suspense>
  );
}
