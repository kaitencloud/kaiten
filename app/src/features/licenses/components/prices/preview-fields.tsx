import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { PreviewAddOnsFields } from './preview-addons-fields';
import { previewFormOpts } from './preview-form-options';
import {
  PreviewUsageFields,
  type PreviewInstances,
} from './preview-usage-fields';
import type { PreviewChoice } from './use-preview-references';

/** One entitlement a sample usage can be given for, as the form shows it. */
export type PreviewSampleField = {
  /** What the entitlement is and what the price that rates it bills against. */
  description?: string;
  entitlementSlug: string;
  label: string;
};

/** One flat fee the invoice can start from, as the select lists it. */
export type PreviewBaseOption = { id: string; label: string };

/** The add-ons that can be priced in, when the session and the release have them. */
export type PreviewAddOns = {
  choices: PreviewChoice[];
  error: unknown;
  isError: boolean;
  retry: () => void;
};

type PreviewFieldsProps = {
  /** The add-ons to price in; none when the session or the release has none. */
  addOns?: PreviewAddOns;
  bases: PreviewBaseOption[];
  /** The instances to rate, when the session may list them. */
  instances?: PreviewInstances;
  /** The API's refusal of the sample usage, shown on it. */
  sampleError?: string;
  samples: PreviewSampleField[];
  /** Whether a code for a voucher can be given: the release ships them. */
  vouchers?: boolean;
};

/**
 * What a preview is asked for: the flat fee the invoice starts from, when the version has
 * more than one; the usage it is rated from, a sample for each metered entitlement or the
 * usage of an instance; the add-ons priced in, with their units; and a code for a voucher
 * to apply. A field left empty is nothing asked: no usage, no add-on, no discount. Nothing
 * is computed here: the API composes the invoice from these.
 */
export const PreviewFields = withForm({
  ...previewFormOpts,
  props: {} as PreviewFieldsProps,
  render: function PreviewFieldsRender({
    addOns,
    bases,
    form,
    instances,
    sampleError,
    samples,
    vouchers = false,
  }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        {bases.length > 1 ? (
          <form.AppField name="basePriceId">
            {(field) => (
              <field.SelectField
                description={t(
                  'Pages.Licenses.Prices.Preview.Descriptions.base',
                )}
                getOptionLabel={(id) =>
                  bases.find((base) => base.id === id)?.label ?? String(id)
                }
                label={t('Pages.Licenses.Prices.Preview.Labels.base')}
                options={bases.map((base) => base.id)}
                required
              />
            )}
          </form.AppField>
        ) : null}
        <PreviewUsageFields
          form={form}
          instances={instances}
          sampleError={sampleError}
          samples={samples}
        />
        {addOns ? <PreviewAddOnsFields form={form} {...addOns} /> : null}
        {vouchers ? (
          <form.AppField name="voucherCode">
            {(field) => (
              <field.TextField
                // A code is typed once and checked by the API: the browser neither
                // remembers it nor offers it again.
                autoComplete="off"
                description={t(
                  'Pages.Licenses.Prices.Preview.Descriptions.voucher',
                )}
                label={t('Pages.Licenses.Prices.Preview.Labels.voucher')}
                placeholder={t(
                  'Pages.Licenses.Prices.Preview.Placeholders.voucher',
                )}
              />
            )}
          </form.AppField>
        ) : null}
      </div>
    );
  },
});
