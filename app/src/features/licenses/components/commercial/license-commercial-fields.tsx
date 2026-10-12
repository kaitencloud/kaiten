import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import {
  PRICING_TYPE_LABEL_KEYS,
  PRICING_TYPES,
  type PricingType,
} from '../../utils/license-commercial.utils';
import { commercialFormOpts } from './license-commercial-form-options';

/**
 * How a version is sold: its pricing type, the trial a subscription starts with,
 * whether sign-up captures a payment method, and where a buyer is sent when the
 * version cannot be bought self-serve. A trial or a URL left empty is none, and
 * clears the one the version had.
 */
export const LicenseCommercialFields = withForm({
  ...commercialFormOpts,
  render: function LicenseCommercialFieldsRender({ form }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="pricingType">
          {(field) => (
            <field.SelectField
              description={t(
                'Pages.Licenses.Commercial.Form.Descriptions.pricingType',
              )}
              getOptionLabel={(option) =>
                t(PRICING_TYPE_LABEL_KEYS[option as PricingType])
              }
              label={t('Pages.Licenses.Commercial.Form.Labels.pricingType')}
              options={[...PRICING_TYPES]}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="trialPeriodDays">
          {(field) => (
            <field.TextField
              description={t(
                'Pages.Licenses.Commercial.Form.Descriptions.trial',
              )}
              label={t('Pages.Licenses.Commercial.Form.Labels.trial')}
              placeholder={t(
                'Pages.Licenses.Commercial.Form.Placeholders.trial',
              )}
            />
          )}
        </form.AppField>
        <form.AppField name="requiresPaymentMethod">
          {(field) => (
            <field.CheckboxField
              description={t(
                'Pages.Licenses.Commercial.Form.Descriptions.paymentMethod',
              )}
              label={t('Pages.Licenses.Commercial.Form.Labels.paymentMethod')}
            />
          )}
        </form.AppField>
        <form.AppField name="selfServeCtaUrl">
          {(field) => (
            <field.TextField
              description={t(
                'Pages.Licenses.Commercial.Form.Descriptions.ctaUrl',
              )}
              label={t('Pages.Licenses.Commercial.Form.Labels.ctaUrl')}
              placeholder={t(
                'Pages.Licenses.Commercial.Form.Placeholders.ctaUrl',
              )}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
