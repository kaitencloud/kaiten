import { formOptions, useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import type { Entitlement, EntitlementUsage } from '@/api-client';
import { LicenseGrantWarning } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import { exceptionDefaults, exceptionLowersValue } from './exception.schema';

export const exceptionFormOptions = formOptions({
  defaultValues: exceptionDefaults,
});

export const ExceptionFields = withForm({
  ...exceptionFormOptions,
  props: {} as {
    entitlements: readonly Entitlement[];
    current: readonly EntitlementUsage[];
  },
  render: function ExceptionFieldsRender({ form, entitlements, current }) {
    const { t } = useTranslation();
    const values = useStore(form.store, (state) => state.values);
    const numeric =
      values.entitlementType === 'NUMBER' ||
      values.entitlementType === 'NUMBER_AI_CREDIT';
    const held = current.find(
      (usage) => usage.entitlementSlug === values.entitlementSlug,
    )?.limit;
    const KEY = 'Pages.EntitlementExceptions';
    return (
      <div className="space-y-4">
        <form.AppField
          name="entitlementSlug"
          listeners={{
            onChange: ({ value }) => {
              const type = entitlements.find(
                (item) => item.slug === value,
              )?.type;
              if (type) form.setFieldValue('entitlementType', type);
              form.setFieldValue('kind', 'SET');
            },
          }}
        >
          {(field) => (
            <field.SelectField
              label={t(`${KEY}.entitlement`)}
              options={entitlements.flatMap((item) =>
                item.slug ? [item.slug] : [],
              )}
              getOptionLabel={(slug) =>
                entitlements.find((item) => item.slug === slug)?.name ??
                String(slug)
              }
              required
            />
          )}
        </form.AppField>
        <form.AppField name="kind">
          {(field) => (
            <field.SelectField
              label={t(`${KEY}.kind`)}
              options={numeric ? ['SET', 'ADD', 'UNLIMITED'] : ['SET']}
              getOptionLabel={(kind) => t(`${KEY}.kinds.${String(kind)}`)}
            />
          )}
        </form.AppField>
        {values.kind !== 'UNLIMITED' &&
          (values.entitlementType === 'BOOLEAN' ? (
            <form.AppField name="booleanValue">
              {(field) => <field.SwitchField label={t(`${KEY}.value`)} />}
            </form.AppField>
          ) : values.entitlementType === 'CONFIG' ? (
            <form.AppField name="jsonValue">
              {(field) => (
                <field.JsonField
                  label={t(`${KEY}.value`)}
                  description={t(`${KEY}.errors.json`)}
                  required
                />
              )}
            </form.AppField>
          ) : (
            <form.AppField name="valueText">
              {(field) => (
                <field.TextField
                  label={t(`${KEY}.value`)}
                  inputMode="decimal"
                  required
                />
              )}
            </form.AppField>
          ))}
        {exceptionLowersValue(values, held) && (
          <LicenseGrantWarning testId="exception-lowers-warning">
            <p>{t(`${KEY}.lowerWarning`)}</p>
          </LicenseGrantWarning>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="startsAt">
            {(field) => (
              <field.DateTimeField
                label={t(`${KEY}.startsAt`)}
                description={t(`${KEY}.startsHelp`)}
              />
            )}
          </form.AppField>
          <form.AppField name="endsAt">
            {(field) => (
              <field.DateTimeField
                label={t(`${KEY}.endsAt`)}
                description={t(`${KEY}.endsHelp`)}
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="reason">
          {(field) => (
            <field.TextAreaField
              label={t(`${KEY}.reason`)}
              description={t(`${KEY}.reasonHelp`)}
              required
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
