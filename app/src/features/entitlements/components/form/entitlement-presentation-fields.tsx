import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { useFormFieldContext } from '@/components/form/form-context';
import { Switch } from '@/components/ui/switch';
import { NumberInput } from '@/components/ui/number-input';
import { EntitlementGroupSelector } from '../groups/entitlement-group-selector';

// The groups selector of the form, named by the label of its field and described by its help
// and its error, as the controls of the other fields are.
export function GroupsControl({
  onChange,
  value,
}: {
  onChange: (groupSlugs: string[]) => void;
  value: string[];
}) {
  const { errors, formDescriptionId, formItemId, formLabelId, formMessageId } =
    useFormFieldContext();
  const hasError = Boolean(errors?.length);

  return (
    <EntitlementGroupSelector
      aria-describedby={
        hasError ? `${formDescriptionId} ${formMessageId}` : formDescriptionId
      }
      aria-invalid={hasError}
      aria-labelledby={formLabelId}
      id={formItemId}
      onChange={onChange}
      value={value}
    />
  );
}

type IdentityExtraFieldProps = {
  form: any;
};

export function UserFacingField({ form }: IdentityExtraFieldProps) {
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

export function DisplayOrderField({ form }: IdentityExtraFieldProps) {
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
