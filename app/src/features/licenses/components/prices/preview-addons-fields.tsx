import { useStore } from '@tanstack/react-form';
import type { ReactNode } from 'react';
import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { useFormFieldContext } from '@/components/form/form-context';
import { Button } from '@/components/ui/button';
import { RetryableProblem } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import {
  newPreviewAddOn,
  type PreviewAddOnRow,
} from '../../schemas/license-preview.schema';
import { previewFormOpts } from './preview-form-options';
import type { PreviewChoice } from './use-preview-references';

type PreviewAddOnsFieldsProps = {
  /** Every version of the catalogue a row can name. */
  choices: PreviewChoice[];
  error: unknown;
  isError: boolean;
  retry: () => void;
};

// The rows are fields of their own, so the list has no control for a label to point to:
// it is a group, named by its heading and described by the hint and the refusal that the
// field renders under it.
function AddOnsGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const labelId = useId();
  const { formDescriptionId, formMessageId } = useFormFieldContext();

  return (
    <div
      aria-describedby={`${formDescriptionId} ${formMessageId}`}
      aria-labelledby={labelId}
      className="space-y-3"
      role="group"
    >
      <p className="text-sm font-medium" id={labelId}>
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The add-ons the invoice is priced with: a row for each, with the version and the units.
 * Their fees are billed for the period of the base, their metered prices are rated, and
 * their grants raise the limit a sample is rated against. A version is on the list once: the
 * versions of the other rows are not offered to a row. What the API refuses of the list
 * (a version that does not exist, a repeated one) is shown under it, in its words.
 */
export const PreviewAddOnsFields = withForm({
  ...previewFormOpts,
  props: {} as PreviewAddOnsFieldsProps,
  render: function PreviewAddOnsFieldsRender({
    choices,
    error,
    form,
    isError,
    retry,
  }) {
    const { t } = useTranslation();
    const rows = useStore(form.store, (state) => state.values.addOns);

    if (isError) {
      return <RetryableProblem error={error} onRetry={retry} />;
    }

    const labelOf = (slug: unknown) =>
      choices.find((choice) => choice.value === slug)?.label ?? String(slug);

    return (
      <form.AppField mode="array" name="addOns">
        {(list) => (
          <FormField<PreviewAddOnRow[]>
            description={t('Pages.Licenses.Prices.Preview.Descriptions.addOns')}
          >
            {() => (
              <AddOnsGroup
                label={t('Pages.Licenses.Prices.Preview.Labels.addOns')}
              >
                {rows.map((row, index) => (
                  <div
                    className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
                    data-testid="preview-addon-row"
                    key={row.key}
                  >
                    <form.AppField name={`addOns[${index}].addonSlug`}>
                      {(field) => (
                        <field.ComboboxField
                          getOptionLabel={labelOf}
                          getOptionValue={(slug: unknown) => String(slug)}
                          label={t(
                            'Pages.Licenses.Prices.Preview.Labels.addOn',
                          )}
                          options={choices
                            .map((choice) => choice.value)
                            .filter(
                              (slug) =>
                                slug === row.addonSlug ||
                                !rows.some((other) => other.addonSlug === slug),
                            )}
                          placeholder={t(
                            'Pages.Licenses.Prices.Preview.Placeholders.addOn',
                          )}
                          required
                          searchPlaceholder={t(
                            'Pages.Licenses.Prices.Preview.Placeholders.addOnSearch',
                          )}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`addOns[${index}].quantity`}>
                      {(field) => (
                        <field.NumberField
                          allowOutOfRange
                          label={t(
                            'Pages.Licenses.Prices.Preview.Labels.addOnQuantity',
                          )}
                          min={1}
                          required
                          step={1}
                        />
                      )}
                    </form.AppField>
                    <Button
                      aria-label={t(
                        'Pages.Licenses.Prices.Preview.removeAddOn',
                        {
                          position: index + 1,
                        },
                      )}
                      className="mt-6 justify-self-end"
                      onClick={() => list.removeValue(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => list.pushValue(newPreviewAddOn())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3" />
                  {t('Pages.Licenses.Prices.Preview.addAddOn')}
                </Button>
              </AddOnsGroup>
            )}
          </FormField>
        )}
      </form.AppField>
    );
  },
});
