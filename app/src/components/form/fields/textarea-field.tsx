import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Textarea } from '@/components/ui/textarea';

type TextareaFieldProps = {
  className?: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
};

const TextareaField = ({
  className,
  label,
  required,
  placeholder,
  description,
  disabled,
}: TextareaFieldProps) => {
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
          <Textarea
            placeholder={placeholder}
            value={field.value ?? ''}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            disabled={disabled}
            aria-invalid={field.hasError}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default TextareaField;
