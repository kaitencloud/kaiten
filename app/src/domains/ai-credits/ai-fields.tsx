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
  description,
}: {
  form: any;
  name: string;
  label: string;
  disabled?: boolean;
  required?: boolean;
  description?: string;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {(field: any) => (
        <field.TextField
          className="[&_input]:min-h-11 sm:[&_input]:min-h-9"
          label={t(label)}
          disabled={disabled}
          required={required}
          description={description}
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
  description,
  disabled = false,
}: {
  form: any;
  name: string;
  label: string;
  options: string[];
  description?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {(field: any) => (
        <field.SelectField
          className="[&_button]:min-h-11 sm:[&_button]:min-h-9"
          label={t(label)}
          disabled={disabled}
          options={options}
          description={description}
          getOptionLabel={(value: unknown) =>
            t(`AI.enums.${String(value)}`, { defaultValue: String(value) })
          }
        />
      )}
    </form.AppField>
  );
}
export function AiDecimalField({
  form,
  name,
  label,
  description,
}: {
  form: any;
  name: string;
  label: string;
  description?: string;
}) {
  const { t } = useTranslation();
  return (
    <form.AppField name={name}>
      {() => (
        <FormField<string | null | undefined>
          label={t(label)}
          description={description}
        >
          {(field) => (
            <FormControl>
              <Input
                className="min-h-11 sm:min-h-9"
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
