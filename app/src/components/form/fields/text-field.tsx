import { Input } from '@/components/ui/input';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

type TextFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

const TextField = ({
  className,
  label,
  required,
  placeholder,
  description,
  disabled,
  onChange,
}: TextFieldProps) => {
  return (
    <FormField<string>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <FormControl>
          <Input
            placeholder={placeholder}
            value={field.value}
            onChange={(e) => {
              field.handleChange(e.target.value);
              onChange?.(e.target.value);
            }}
            onBlur={field.handleBlur}
            disabled={disabled}
            aria-invalid={field.hasError}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default TextField;
