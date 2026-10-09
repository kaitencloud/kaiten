import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { addonFormOpts } from '../../schemas/addon-form-options';
import type { AddonPricingType } from '../../types';
import { PRICING_TYPE_LABEL_KEYS } from '../../utils/addon-labels';

const PRICING_TYPES = ['FREE', 'PAID', 'CUSTOM'] as const;

/** What the form is for: a new family, the next version of one, or an existing version. */
export type AddonFormMode = 'edit' | 'family' | 'version';

type AddonFormFieldsProps = {
  mode: AddonFormMode;
};

/**
 * The fields of an add-on version: how it is called and sold, and the most an
 * instance can hold. The slug and the family are the API's to name unless the person
 * does for a new family; a version is created as a draft, which is the state that can
 * be given its grants, prices and licenses before it is on sale. An existing version
 * keeps how it is sold: the API replaces its name, description, version name and
 * maximum quantity, and nothing else.
 */
export const AddonFormFields = withForm({
  ...addonFormOpts,
  props: {} as AddonFormFieldsProps,
  render: function AddonFormFieldsRender({ form, mode }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              description={t('Pages.Addons.Form.Descriptions.name')}
              label={t('Pages.Addons.Form.Labels.name')}
              placeholder={t('Pages.Addons.Form.Placeholders.name')}
              required
            />
          )}
        </form.AppField>
        {mode === 'family' ? (
          <form.AppField name="slug">
            {(field) => (
              <field.TextField
                description={t('Pages.Addons.Form.Descriptions.slug')}
                label={t('Pages.Addons.Form.Labels.slug')}
                placeholder={t('Pages.Addons.Form.Placeholders.slug')}
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="description">
          {(field) => (
            <field.TextAreaField
              description={t('Pages.Addons.Form.Descriptions.description')}
              label={t('Pages.Addons.Form.Labels.description')}
              placeholder={t('Pages.Addons.Form.Placeholders.description')}
            />
          )}
        </form.AppField>
        {mode === 'edit' ? null : (
          <form.AppField name="pricingType">
            {(field) => (
              <field.SelectField
                description={t('Pages.Addons.Form.Descriptions.pricingType')}
                getOptionLabel={(option) =>
                  t(PRICING_TYPE_LABEL_KEYS[option as AddonPricingType])
                }
                label={t('Pages.Addons.Form.Labels.pricingType')}
                options={[...PRICING_TYPES]}
                required
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="versionName">
          {(field) => (
            <field.TextField
              description={t('Pages.Addons.Form.Descriptions.versionName')}
              label={t('Pages.Addons.Form.Labels.versionName')}
              placeholder={t('Pages.Addons.Form.Placeholders.versionName')}
            />
          )}
        </form.AppField>
        <form.AppField name="maxQuantity">
          {(field) => (
            <field.NumberField
              // A quantity out of range is refused in words, and not changed to the bound.
              allowOutOfRange
              description={t('Pages.Addons.Form.Descriptions.maxQuantity')}
              label={t('Pages.Addons.Form.Labels.maxQuantity')}
              min={1}
              placeholder={t('Pages.Addons.Form.Placeholders.maxQuantity')}
              step={1}
            />
          )}
        </form.AppField>
        {mode === 'edit' ? null : (
          <form.AppField name="createAsDraft">
            {(field) => (
              <field.CheckboxField
                description={t('Pages.Addons.Form.Descriptions.createAsDraft')}
                label={t('Pages.Addons.Form.Labels.createAsDraft')}
              />
            )}
          </form.AppField>
        )}
      </div>
    );
  },
});
