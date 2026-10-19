import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

export function AiTextField({
  form,
  name,
  label,
  disabled = false,
  required = false,
}: {
  form: any;
  name: string;
  label: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {(field: any) => (
        <field.TextField
          label={t(label)}
          disabled={disabled}
          required={required}
        />
      )}
    </form.AppField>
  );
}
export function AiSelectField({
  form,
  name,
  label,
  options,
  disabled = false,
}: {
  form: any;
  name: string;
  label: string;
  options: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {(field: any) => (
        <field.SelectField
          label={t(label)}
          disabled={disabled}
          options={options}
          getOptionLabel={(value: unknown) => String(value)}
        />
      )}
    </form.AppField>
  );
}
export function AiDecimalField({
  form,
  name,
  label,
}: {
  form: any;
  name: string;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {() => (
        <FormField<string | null | undefined> label={t(label)}>
          {(field) => (
            <FormControl>
              <Input
                inputMode="decimal"
                value={field.value ?? ''}
                onChange={(event) =>
                  field.handleChange(event.target.value || undefined)
                }
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
