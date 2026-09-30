import { useId } from 'react';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type CheckboxFieldProps = {
  className?: string;
  label: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

const CheckboxField = ({
  className,
  label,
  description,
  disabled,
  required,
}: CheckboxFieldProps) => {
  const checkboxId = useId();

  return (
    <FormField<boolean>
      className={className}
      description={description}
      disabled={disabled}
      required={required}
    >
      {(field) => (
        <FormControl>
          <div className="flex items-center space-x-2">
            <Checkbox
              id={checkboxId}
              checked={field.value}
              onCheckedChange={(checked) =>
                field.handleChange(checked === true)
              }
              onBlur={field.handleBlur}
              disabled={disabled}
              aria-invalid={field.hasError}
            />
            <Label
              htmlFor={checkboxId}
              className={
                field.hasError
                  ? 'text-destructive-subtle-foreground'
                  : undefined
              }
            >
              {label}
            </Label>
          </div>
        </FormControl>
      )}
    </FormField>
  );
};

export default CheckboxField;
