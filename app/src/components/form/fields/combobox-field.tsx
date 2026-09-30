import { Combobox, type ComboboxProps } from '@/components/combobox';
import FormField from '@/components/form/fields/form-field';

type ComboboxFieldProps<TOption = unknown> = Omit<
  ComboboxProps<TOption>,
  'onSelect' | 'value'
> & {
  className?: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  description?: string;
  searchPlaceholder?: string;
  options: TOption[];
  getOptionLabel: (option: TOption) => string;
  getOptionValue: (option: TOption) => string;
};

function ComboboxField<TOption = unknown>({
  className,
  disabled,
  label,
  required,
  description,
  ...comboboxProps
}: ComboboxFieldProps<TOption>) {
  return (
    <FormField<string>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <Combobox
          disabled={disabled}
          {...comboboxProps}
          value={typeof field.value === 'string' ? field.value : ''}
          onSelect={field.handleChange}
        />
      )}
    </FormField>
  );
}

export default ComboboxField;
