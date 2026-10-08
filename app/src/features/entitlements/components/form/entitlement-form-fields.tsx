import { IconPicker } from '@/components/ui/icon-picker';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { EntitlementGroupSelector } from '../groups/entitlement-group-selector';
import { EntitlementResetPeriodFields } from './entitlement-reset-period-fields';
import { EntitlementSlugField } from './entitlement-slug-field';
import { EntitlementUnitFields } from './entitlement-unit-fields';

type EntitlementSelectOption = {
  label: string;
  value: string;
};

const entitlementTypeOptions: EntitlementSelectOption[] = [
  { label: 'Boolean', value: 'BOOLEAN' },
  { label: 'Number', value: 'NUMBER' },
  { label: 'Config', value: 'CONFIG' },
];

const aggregationMethodOptions: EntitlementSelectOption[] = [
  { label: 'Count', value: 'COUNT' },
  { label: 'Sum', value: 'SUM' },
  { label: 'Average', value: 'AVERAGE' },
  { label: 'Min', value: 'MIN' },
  { label: 'Max', value: 'MAX' },
  { label: 'Latest', value: 'LATEST' },
];

const getSelectOptionLabel = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'label' in option) {
    return String((option as EntitlementSelectOption).label);
  }

  return String(option);
};

const getSelectOptionValue = (option: unknown) => {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return String((option as EntitlementSelectOption).value);
  }

  return String(option);
};

type EntitlementIdentityFieldsProps = {
  className?: string;
  entitlement?: Entitlement;
  form: any;
};

export function EntitlementIdentityFields({
  className,
  entitlement,
  form,
}: EntitlementIdentityFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={cn(className)}>
      <form.AppField name="name">
        {(field: any) => (
          <field.TextField
            label={t('Pages.Entitlements.Mutation.Form.Labels.name')}
            required
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.name',
            )}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.name',
            )}
          />
        )}
      </form.AppField>
      <EntitlementSlugField entitlement={entitlement} form={form} />
      <form.AppField name="icon">
        {() => (
          <FormField<string | undefined>
            label={t('Pages.Entitlements.Mutation.Form.Labels.icon')}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.icon',
            )}
          >
            {(field) => (
              <IconPicker
                value={field.value ?? null}
                onChange={(token) => {
                  field.handleChange(token ?? undefined);
                  field.handleBlur();
                }}
                labels={{
                  trigger: t('Pages.Entitlements.Mutation.Form.Icon.trigger'),
                  searchPlaceholder: t(
                    'Pages.Entitlements.Mutation.Form.Icon.search',
                  ),
                  empty: t('Pages.Entitlements.Mutation.Form.Icon.empty'),
                  clear: t('Pages.Entitlements.Mutation.Form.Icon.clear'),
                }}
              />
            )}
          </FormField>
        )}
      </form.AppField>
      <form.AppField name="description">
        {(field: any) => (
          <field.TextAreaField
            label={t('Pages.Entitlements.Mutation.Form.Labels.description')}
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.description',
            )}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.description',
            )}
          />
        )}
      </form.AppField>
      <form.AppField name="groupSlugs">
        {() => (
          <FormField<string[]>
            label={t('Pages.Entitlements.Mutation.Form.Labels.groups')}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.groups',
            )}
          >
            {(field) => (
              <EntitlementGroupSelector
                value={field.value ?? []}
                onChange={(groupSlugs) => {
                  field.handleChange(groupSlugs);
                  field.handleBlur();
                }}
              />
            )}
          </FormField>
        )}
      </form.AppField>
      <UserFacingField form={form} />
      <DisplayOrderField form={form} />
    </div>
  );
}

type IdentityExtraFieldProps = {
  form: any;
};

function UserFacingField({ form }: IdentityExtraFieldProps) {
  const { t } = useTranslation();

  return (
    <form.AppField name="userFacing">
      {() => (
        <FormField<boolean | undefined>
          label={t('Pages.Entitlements.Mutation.Form.Labels.userFacing')}
          description={t(
            'Pages.Entitlements.Mutation.Form.Descriptions.userFacing',
          )}
        >
          {(field) => (
            <Switch
              aria-label={t(
                'Pages.Entitlements.Mutation.Form.Labels.userFacing',
              )}
              checked={field.value ?? false}
              onCheckedChange={(checked) => {
                field.handleChange(checked);
                field.handleBlur();
              }}
            />
          )}
        </FormField>
      )}
    </form.AppField>
  );
}

function DisplayOrderField({ form }: IdentityExtraFieldProps) {
  const { t } = useTranslation();

  return (
    <form.AppField name="displayOrder">
      {() => (
        <FormField<number | undefined>
          label={t('Pages.Entitlements.Mutation.Form.Labels.displayOrder')}
          description={t(
            'Pages.Entitlements.Mutation.Form.Descriptions.displayOrder',
          )}
        >
          {(field) => (
            <FormControl>
              <NumberInput
                value={Number.isFinite(field.value) ? field.value : 0}
                min={0}
                step={1}
                placeholder={t(
                  'Pages.Entitlements.Mutation.Form.Placeholders.displayOrder',
                )}
                // A cleared input reports null; treat a blank order as 0 so the
                // form value never becomes NaN and submission stays unblocked.
                onValueChange={(value) => field.handleChange(value ?? 0)}
                onBlur={field.handleBlur}
                aria-invalid={field.hasError}
              />
            </FormControl>
          )}
        </FormField>
      )}
    </form.AppField>
  );
}

type EntitlementTypeFieldsProps = {
  className?: string;
  entitlement?: Entitlement;
  form: any;
};

export function EntitlementTypeFields({
  className,
  entitlement,
  form,
}: EntitlementTypeFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={cn(className)}>
      <form.AppField name="type">
        {(field: any) => (
          <field.SelectField
            label={t('Pages.Entitlements.Mutation.Form.Labels.type')}
            required
            placeholder={t(
              'Pages.Entitlements.Mutation.Form.Placeholders.type',
            )}
            description={t(
              'Pages.Entitlements.Mutation.Form.Descriptions.type',
            )}
            options={entitlementTypeOptions}
            getOptionValue={getSelectOptionValue}
            getOptionLabel={getSelectOptionLabel}
            disabled={Boolean(entitlement)}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state: any) => state.values.type}>
        {(type: string) =>
          type === 'NUMBER' ? (
            <>
              <form.AppField name="aggregationMethod">
                {(field: any) => (
                  <field.SelectField
                    label={t(
                      'Pages.Entitlements.Mutation.Form.Labels.aggregationMethod',
                    )}
                    placeholder={t(
                      'Pages.Entitlements.Mutation.Form.Placeholders.aggregationMethod',
                    )}
                    description={t(
                      'Pages.Entitlements.Mutation.Form.Descriptions.aggregationMethod',
                    )}
                    options={aggregationMethodOptions}
                    getOptionValue={getSelectOptionValue}
                    getOptionLabel={getSelectOptionLabel}
                    disabled={Boolean(entitlement)}
                  />
                )}
              </form.AppField>
              <EntitlementResetPeriodFields
                entitlement={entitlement}
                form={form}
              />
              <EntitlementUnitFields entitlement={entitlement} form={form} />
            </>
          ) : null
        }
      </form.Subscribe>
    </div>
  );
}
