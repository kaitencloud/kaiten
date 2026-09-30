import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { generateSlug } from '@/functionals/slug';
import { withForm } from '@/hooks/form';
import type { GeneralFormProps } from '../../types';
import { featureFlagFormOpts } from '../../utils/shared-form';

export const GeneralForm = withForm({
  ...featureFlagFormOpts,
  props: {} as GeneralFormProps,
  render: function GeneralFormRender({ form, featureFlag }) {
    const { t } = useTranslation();
    const isEditMode = !!featureFlag;

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {t('Pages.FeatureFlags.Mutation.Form.Step1.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={t('Pages.FeatureFlags.Mutation.Form.Step1.Labels.name')}
                required
                placeholder={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Placeholders.name',
                )}
                description={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Descriptions.name',
                )}
                onChange={(value) => {
                  const slug = generateSlug(value);
                  form.setFieldValue('slug', slug);
                }}
              />
            )}
          </form.AppField>

          <form.AppField
            name="type"
            listeners={{
              // Warm the JsonField + CodeMirror chunks the moment "object" is
              // picked, so the variants step (step 2) renders without a flash.
              onChange: ({ value }) => {
                if (value === 'object') {
                  void import('@/components/form/fields/json-field');
                  void import('@uiw/react-codemirror');
                  void import('@codemirror/lang-json');
                }
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label={t('Pages.FeatureFlags.Mutation.Form.Step1.Labels.type')}
                placeholder={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Placeholders.type',
                )}
                description={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Descriptions.type',
                )}
                disabled={isEditMode}
                options={[
                  {
                    label: t('Pages.FeatureFlags.Types.boolean'),
                    value: 'boolean',
                  },
                  {
                    label: t('Pages.FeatureFlags.Types.string'),
                    value: 'string',
                  },
                  {
                    label: t('Pages.FeatureFlags.Types.number'),
                    value: 'number',
                  },
                  {
                    label: t('Pages.FeatureFlags.Types.object'),
                    value: 'object',
                  },
                ]}
                getOptionValue={(option: any) =>
                  (option as { value: string }).value
                }
                getOptionLabel={(option: any) =>
                  (option as { label: string }).label
                }
              />
            )}
          </form.AppField>

          <div className="md:col-span-2">
            <form.AppField name="description">
              {(field) => (
                <field.TextAreaField
                  label={t(
                    'Pages.FeatureFlags.Mutation.Form.Step1.Labels.description',
                  )}
                  placeholder={t(
                    'Pages.FeatureFlags.Mutation.Form.Step1.Placeholders.description',
                  )}
                  description={t(
                    'Pages.FeatureFlags.Mutation.Form.Step1.Descriptions.description',
                  )}
                />
              )}
            </form.AppField>
          </div>

          <form.AppField name="slug">
            {(field) => (
              <field.TextField
                label={t('Pages.FeatureFlags.Mutation.Form.Step1.Labels.slug')}
                required
                placeholder={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Placeholders.slug',
                )}
                description={t(
                  'Pages.FeatureFlags.Mutation.Form.Step1.Descriptions.slug',
                )}
              />
            )}
          </form.AppField>
        </CardContent>
      </Card>
    );
  },
});
