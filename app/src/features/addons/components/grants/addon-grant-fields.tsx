import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { withForm } from '@/hooks/form';
import type { LicenseOverage } from '../../hooks';
import { addonGrantFormOpts } from '../../schemas/addon-grant-form-options';
import {
  getEntitlementSlug,
  OVERRIDE_BEHAVIOR_LABEL_KEYS,
  OVERRIDE_BEHAVIORS,
  type OverrideBehavior,
  toGrantType,
} from '../../utils/addon-grant.utils';
import { LicenseOverageWarning } from './license-overage-warning';

type AddonGrantFieldsProps = {
  /** An existing grant keeps its entitlement: it is the grant's identity. */
  isEditing: boolean;
  /** What the allowance of each compatible license is, for the warning. */
  licenseOverage: ReadonlyMap<string, LicenseOverage[]>;
  /** The entitlements the grant can be for: the ones the version does not grant yet. */
  options: readonly Entitlement[];
};

/**
 * The fields of a grant: the entitlement, then the value of the kind it is -- a number
 * per unit of quantity, which can be unlimited, a flag or a configuration -- and, for
 * a number, how it combines with the license's and the overage it allows. The overage
 * is empty to inherit the license's; set, it replaces the license's on every instance
 * that attaches the add-on, and the form says so when that makes the quota harder.
 */
export const AddonGrantFields = withForm({
  ...addonGrantFormOpts,
  props: {} as AddonGrantFieldsProps,
  render: function AddonGrantFieldsRender({
    form,
    isEditing,
    licenseOverage,
    options,
  }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField
          listeners={{
            // The entitlement says which kind of value the grant holds.
            onChange: ({ value }) =>
              form.setFieldValue(
                'grantType',
                toGrantType(
                  options.find((option) => getEntitlementSlug(option) === value)
                    ?.type,
                ),
              ),
          }}
          name="entitlementSlug"
        >
          {(field) => (
            <field.SelectField
              description={t(
                'Pages.Addons.Grants.Form.Descriptions.entitlement',
              )}
              disabled={isEditing}
              getOptionLabel={(option) => (option as Entitlement).name}
              getOptionValue={(option) =>
                getEntitlementSlug(option as Entitlement)
              }
              label={t('Pages.Addons.Grants.Form.Labels.entitlement')}
              options={[...options]}
              placeholder={t(
                'Pages.Addons.Grants.Form.Placeholders.entitlement',
              )}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.grantType}>
          {(grantType) => {
            if (grantType === 'BOOLEAN') {
              return (
                <form.AppField name="booleanValue">
                  {(field) => (
                    <field.CheckboxField
                      description={t(
                        'Pages.Addons.Grants.Form.Descriptions.boolean',
                      )}
                      label={t('Pages.Addons.Grants.Form.Labels.boolean')}
                    />
                  )}
                </form.AppField>
              );
            }
            if (grantType === 'CONFIG') {
              return (
                <form.AppField name="configValue">
                  {(field) => (
                    <field.JsonField
                      description={t(
                        'Pages.Addons.Grants.Form.Descriptions.config',
                      )}
                      label={t('Pages.Addons.Grants.Form.Labels.config')}
                    />
                  )}
                </form.AppField>
              );
            }

            return (
              <NumberGrantFields form={form} licenseOverage={licenseOverage} />
            );
          }}
        </form.Subscribe>
      </div>
    );
  },
});

/** The fields of a number grant. */
const NumberGrantFields = withForm({
  ...addonGrantFormOpts,
  props: {} as Pick<AddonGrantFieldsProps, 'licenseOverage'>,
  render: function NumberGrantFieldsRender({ form, licenseOverage }) {
    const { t } = useTranslation();

    return (
      <>
        <form.Subscribe selector={(state) => state.values.unlimited}>
          {(unlimited) => (
            <form.AppField name="numberValue">
              {(field) => (
                <field.NumberField
                  // A quantity out of range is refused in words, and not changed to the bound.
                  allowOutOfRange
                  description={t(
                    'Pages.Addons.Grants.Form.Descriptions.number',
                  )}
                  disabled={unlimited}
                  label={t('Pages.Addons.Grants.Form.Labels.number')}
                  min={0}
                  placeholder={t(
                    'Pages.Addons.Grants.Form.Placeholders.number',
                  )}
                  required={!unlimited}
                  step={1}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="unlimited">
          {(field) => (
            <field.CheckboxField
              label={t('Pages.Addons.Grants.Form.Labels.unlimited')}
            />
          )}
        </form.AppField>
        <form.AppField name="overrideBehavior">
          {(field) => (
            <field.SelectField
              description={t('Pages.Addons.Grants.Form.Descriptions.behavior')}
              getOptionLabel={(option) =>
                t(OVERRIDE_BEHAVIOR_LABEL_KEYS[option as OverrideBehavior])
              }
              label={t('Pages.Addons.Grants.Form.Labels.behavior')}
              options={[...OVERRIDE_BEHAVIORS]}
              required
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.unlimited}>
          {(unlimited) =>
            unlimited ? null : (
              <form.AppField name="overagePercent">
                {(field) => (
                  <field.NumberField
                    // A percentage out of range is refused in words, and not changed to the bound.
                    allowOutOfRange
                    description={t(
                      'Pages.Addons.Grants.Form.Descriptions.overage',
                    )}
                    label={t('Pages.Addons.Grants.Form.Labels.overage')}
                    min={0}
                    placeholder={t(
                      'Pages.Addons.Grants.Form.Placeholders.overage',
                    )}
                    step={1}
                  />
                )}
              </form.AppField>
            )
          }
        </form.Subscribe>
        <form.Subscribe
          selector={(state) =>
            [
              state.values.entitlementSlug,
              state.values.overagePercent,
              state.values.unlimited,
            ] as const
          }
        >
          {([entitlementSlug, overagePercent, unlimited]) => (
            <LicenseOverageWarning
              addonPercent={unlimited ? Number.NaN : overagePercent}
              licenses={licenseOverage.get(entitlementSlug) ?? []}
            />
          )}
        </form.Subscribe>
      </>
    );
  },
});
