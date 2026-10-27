import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';

type TextFieldProps = {
  /**
   * What the browser may fill in. A field that holds a secret the person typed once
   * (a voucher code) says `off`, so that it is neither remembered nor offered again.
   */
  autoComplete?: string;
  className?: string;
  inputMode?: ComponentProps<'input'>['inputMode'];
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  /**
   * The input's type. `password` is for a secret that is typed and never read back:
   * the characters are hidden, and the browser is told not to offer it again.
   */
  type?: ComponentProps<'input'>['type'];
};

const TextField = ({
  autoComplete,
  className,
  inputMode,
  label,
  required,
  placeholder,
  description,
  disabled,
  onChange,
  type,
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
            autoComplete={type === 'password' ? 'off' : autoComplete}
            inputMode={inputMode}
            placeholder={placeholder}
            value={field.value}
            onChange={(e) => {
              field.handleChange(e.target.value);
              onChange?.(e.target.value);
            }}
            onBlur={field.handleBlur}
            disabled={disabled}
            aria-invalid={field.hasError}
            type={type}
          />
        </FormControl>
      )}
    </FormField>
  );
};

export default TextField;
