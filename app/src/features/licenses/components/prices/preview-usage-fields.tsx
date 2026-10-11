import { useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { ChoiceButton } from '@/components/choice-button';
import { RetryableProblem } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { PREVIEW_USAGE_SOURCES } from '../../schemas/license-preview.schema';
import { previewFormOpts } from './preview-form-options';
import type { PreviewSampleField } from './preview-fields';
import type { PreviewChoice } from './use-preview-references';

/** The instances whose usage can be rated, as the dialog read them. */
export type PreviewInstances = {
  choices: PreviewChoice[];
  error: unknown;
  isError: boolean;
  isPending: boolean;
  retry: () => void;
};

type PreviewUsageFieldsProps = {
  /** The instances to rate, when the session may list them; the usage is then a sample or an instance's. */
  instances?: PreviewInstances;
  /** The API's refusal of the sample usage, shown on it. */
  sampleError?: string;
  /** One for each entitlement a price of the version or of an add-on in the list rates. */
  samples: PreviewSampleField[];
};

const SOURCE_KEYS = {
  instance: {
    detail: 'Pages.Licenses.Prices.Preview.Source.instanceDetail',
    label: 'Pages.Licenses.Prices.Preview.Source.instance',
  },
  samples: {
    detail: 'Pages.Licenses.Prices.Preview.Source.samplesDetail',
    label: 'Pages.Licenses.Prices.Preview.Source.samples',
  },
} as const;

/**
 * Where the usage the invoice is rated from comes from, and the fields of it: a sample
 * for each entitlement a price rates, or the instance whose own usage over its current
 * period is rated. The API takes one of the two, so the form is on one at a time, and the
 * fields of the other are not there: nothing hidden is sent. The choice is offered only
 * to a session that may list the instances.
 */
export const PreviewUsageFields = withForm({
  ...previewFormOpts,
  props: {} as PreviewUsageFieldsProps,
  render: function PreviewUsageFieldsRender({
    form,
    instances,
    sampleError,
    samples,
  }) {
    const { t } = useTranslation();
    const source = useStore(form.store, (state) => state.values.usageSource);

    const renderSample = (sample: PreviewSampleField) => (
      <form.AppField
        defaultValue=""
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
      <div className="space-y-4">
        {instances ? (
          <div
            aria-label={t('Pages.Licenses.Prices.Preview.Labels.usage')}
            className="space-y-2"
            role="group"
          >
            <p className="text-sm font-medium">
              {t('Pages.Licenses.Prices.Preview.Labels.usage')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PREVIEW_USAGE_SOURCES.map((option) => (
                <ChoiceButton
                  detail={t(SOURCE_KEYS[option].detail)}
                  key={option}
                  label={t(SOURCE_KEYS[option].label)}
                  onSelect={() => form.setFieldValue('usageSource', option)}
                  selected={source === option}
                />
              ))}
            </div>
          </div>
        ) : null}
        {instances && source === 'instance' ? (
          instances.isError ? (
            <RetryableProblem
              error={instances.error}
              onRetry={instances.retry}
            />
          ) : (
            <form.AppField name="instanceSlug">
              {(field) => (
                <field.ComboboxField
                  description={t(
                    'Pages.Licenses.Prices.Preview.Descriptions.instance',
                  )}
                  getOptionLabel={(slug: unknown) =>
                    instances.choices.find((choice) => choice.value === slug)
                      ?.label ?? String(slug)
                  }
                  getOptionValue={(slug: unknown) => String(slug)}
                  label={t('Pages.Licenses.Prices.Preview.Labels.instance')}
                  options={instances.choices.map((choice) => choice.value)}
                  placeholder={
                    instances.isPending
                      ? t(
                          'Pages.Licenses.Prices.Preview.Placeholders.instanceLoading',
                        )
                      : t('Pages.Licenses.Prices.Preview.Placeholders.instance')
                  }
                  required
                  searchPlaceholder={t(
                    'Pages.Licenses.Prices.Preview.Placeholders.instanceSearch',
                  )}
                />
              )}
            </form.AppField>
          )
        ) : samples.length > 0 ? (
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
