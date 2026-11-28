import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';

type LimitScopeOption = {
  label: string;
  value: string;
};

// The labels are i18n keys, written out in full so that the check of the keys sees them.
const limitScopeOptions: LimitScopeOption[] = [
  { label: 'Pages.Entitlements.LimitScopes.INSTANCE', value: 'INSTANCE' },
  { label: 'Pages.Entitlements.LimitScopes.RESOURCE', value: 'RESOURCE' },
];

const getOptionValue = (option: unknown) =>
  String((option as LimitScopeOption).value);
const getOptionLabel = (option: unknown) =>
  String((option as LimitScopeOption).label);

type EntitlementLimitScopeFieldProps = {
  entitlement?: Entitlement;
  form: any;
};

/**
 * What the limit of a NUMBER entitlement applies to: the instance as a whole, or each
 * resource of the instance (a competitor, a source, a project), every resource being
 * measured against the same limit. Like the aggregation method it is chosen once: an
 * existing entitlement shows it read-only, since the counters already kept would mean
 * something else under the other choice. The form shows it for a NUMBER only, which is
 * the one type that has it.
 */
export function EntitlementLimitScopeField({
  entitlement,
  form,
}: EntitlementLimitScopeFieldProps) {
  const { t } = useTranslation();
  const locked = Boolean(entitlement);

  return (
    <form.AppField name="limitScope">
      {(field: any) => (
        <field.SelectField
          label={t('Pages.Entitlements.Mutation.Form.Labels.limitScope')}
          placeholder={t(
            'Pages.Entitlements.Mutation.Form.Placeholders.limitScope',
          )}
          description={
            locked
              ? t(
                  'Pages.Entitlements.Mutation.Form.Descriptions.limitScopeLocked',
                )
              : t('Pages.Entitlements.Mutation.Form.Descriptions.limitScope')
          }
          options={limitScopeOptions}
          getOptionValue={getOptionValue}
          getOptionLabel={(option: unknown) => t(getOptionLabel(option))}
          disabled={locked}
        />
      )}
    </form.AppField>
  );
}
