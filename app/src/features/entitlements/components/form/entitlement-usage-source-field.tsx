import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { newSourceRow } from './entitlement-form.shared';

type UsageSourceOption = { label: string; value: string };

// The labels are i18n keys, written out in full so that the check of the keys sees them.
const usageSourceOptions: UsageSourceOption[] = [
  {
    label: 'Pages.Entitlements.UsageSources.CALCULATED_USAGE',
    value: 'CALCULATED_USAGE',
  },
  {
    label: 'Pages.Entitlements.UsageSources.COMBINED_USAGE',
    value: 'COMBINED_USAGE',
  },
];

const getOptionValue = (option: unknown) =>
  String((option as UsageSourceOption).value);

type EntitlementUsageSourceFieldProps = {
  entitlement?: Entitlement;
  form: any;
};

/**
 * Where the usage of a NUMBER entitlement comes from: reported by the code of the
 * vendor (calculated), or the weighted sum of other entitlements (combined). It is
 * chosen once, like the type and the aggregation method, and read-only afterwards.
 * Choosing combined starts the list of sources with two blank lines, which is the
 * least a sum can have.
 */
export function EntitlementUsageSourceField({
  entitlement,
  form,
}: EntitlementUsageSourceFieldProps) {
  const { t } = useTranslation();

  return (
    <form.AppField
      name="usageSource"
      listeners={{
        onChange: ({ fieldApi, value }: any) => {
          if (
            value === 'COMBINED_USAGE' &&
            (fieldApi.form.getFieldValue('sources') ?? []).length === 0
          ) {
            fieldApi.form.setFieldValue('sources', [
              newSourceRow(),
              newSourceRow(),
            ]);
          }
        },
      }}
    >
      {(field: any) => (
        <field.SelectField
          label={t('Pages.Entitlements.Mutation.Form.Labels.usageSource')}
          placeholder={t(
            'Pages.Entitlements.Mutation.Form.Placeholders.usageSource',
          )}
          description={t(
            entitlement
              ? 'Pages.Entitlements.Mutation.Form.Descriptions.usageSourceLocked'
              : 'Pages.Entitlements.Mutation.Form.Descriptions.usageSource',
          )}
          options={usageSourceOptions}
          getOptionValue={getOptionValue}
          getOptionLabel={(option: unknown) =>
            t((option as UsageSourceOption).label)
          }
          disabled={Boolean(entitlement)}
        />
      )}
    </form.AppField>
  );
}
