import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SelectFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options: unknown[];
  disabled?: boolean;
  getOptionLabel: (option: unknown) => string;
  getOptionValue?: (option: unknown) => string;
};

function SelectField({
  className,
  label,
  required,
  placeholder,
  description,
  options,
  disabled,
  getOptionLabel,
  getOptionValue = (option: unknown) => option as unknown as string,
}: SelectFieldProps) {
  const renderOption = (option: unknown) => {
    const value = getOptionValue(option);
    return (
      <SelectItem key={value} value={value}>
        {getOptionLabel(option)}
      </SelectItem>
    );
  };

  return (
    <FormField<string>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <Select
          items={options.map((option) => ({
            value: getOptionValue(option),
            label: getOptionLabel(option),
          }))}
          onValueChange={(value) => field.handleChange(value ?? '')}
          value={field.value || null}
          disabled={disabled}
        >
          <FormControl>
            <SelectTrigger disabled={disabled} className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
          </FormControl>
          <SelectContent>{options.map(renderOption)}</SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export default SelectField;
