import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { previewFormOpts } from './preview-form-options';

/** One entitlement a sample usage can be given for, as the form shows it. */
export type PreviewSampleField = {
  /** What the entitlement is and what the price that rates it bills against. */
  description?: string;
  entitlementSlug: string;
  label: string;
};

/** One flat fee the invoice can start from, as the select lists it. */
export type PreviewBaseOption = { id: string; label: string };

type PreviewFieldsProps = {
  bases: PreviewBaseOption[];
  samples: PreviewSampleField[];
  /** The API's refusal of the sample usage, shown on it. */
  sampleError?: string;
};

/**
 * What a preview is asked for: the flat fee the invoice starts from, when the
 * version has more than one, and what each metered entitlement used over the
 * period that ends. A field left empty is no usage. Nothing is computed here: the
 * API composes the invoice from these.
 */
export const PreviewFields = withForm({
  ...previewFormOpts,
  props: {} as PreviewFieldsProps,
  render: function PreviewFieldsRender({ bases, form, sampleError, samples }) {
    const { t } = useTranslation();

    const renderSample = (sample: PreviewSampleField) => (
      <form.AppField
        key={sample.entitlementSlug}
        name={`samples.${sample.entitlementSlug}`}
      >
        {(field) => (
          <field.TextField
            description={sample.description}
            label={sample.label}
            placeholder={t(
              'Pages.Licenses.Prices.Preview.Placeholders.quantity',
            )}
          />
        )}
      </form.AppField>
    );

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
        {samples.length > 0 ? (
          <fieldset
            aria-describedby={sampleError ? 'sample-usage-error' : undefined}
            className="space-y-3"
          >
            <legend className="text-sm font-medium">
              {t('Pages.Licenses.Prices.Preview.Labels.samples')}
            </legend>
            <p className="text-xs text-muted-foreground">
              {t('Pages.Licenses.Prices.Preview.Descriptions.samples')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {samples.map(renderSample)}
            </div>
            {sampleError ? (
              <p
                className="text-destructive-subtle-foreground text-[0.8rem] font-medium"
                id="sample-usage-error"
                role="alert"
              >
                {sampleError}
              </p>
            ) : null}
          </fieldset>
        ) : null}
      </div>
    );
  },
});
