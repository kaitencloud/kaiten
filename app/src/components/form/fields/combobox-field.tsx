import { Combobox, type ComboboxProps } from '@/components/combobox';
import FormField from '@/components/form/fields/form-field';
import { useFormFieldContext } from '@/components/form/form-context';

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

type ComboboxControlProps<TOption> = Omit<
  ComboboxProps<TOption>,
  'aria-describedby' | 'aria-invalid' | 'id'
>;

// The combobox of a field, tied to what the field says around it: the label names it, ahead of
// the value it shows (`fieldLabel`), and the help and the error describe it. A `Select` gets
// this from `FormControl`; a combobox is not one control but a trigger and a list, so it is
// passed on.
function ComboboxControl<TOption>(props: ComboboxControlProps<TOption>) {
  const { errors, formDescriptionId, formItemId, formMessageId } =
    useFormFieldContext();
  const hasError = Boolean(errors?.length);

  return (
    <Combobox
      {...props}
      aria-describedby={
        hasError ? `${formDescriptionId} ${formMessageId}` : formDescriptionId
      }
      aria-invalid={hasError}
      id={formItemId}
    />
  );
}

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
        <ComboboxControl
          disabled={disabled}
          fieldLabel={label}
          {...comboboxProps}
          value={typeof field.value === 'string' ? field.value : ''}
          onSelect={field.handleChange}
        />
      )}
    </FormField>
  );
}

export default ComboboxField;
