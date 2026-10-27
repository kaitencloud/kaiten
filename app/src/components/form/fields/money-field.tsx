import { useId } from 'react';
import FormField from '@/components/form/fields/form-field';
import type useField from '@/components/form/fields/use-field';
import FormControl from '@/components/form/form-control';
import { useFormFieldContext } from '@/components/form/form-context';
import { Input } from '@/components/ui/input';

type MoneyFieldProps = {
  className?: string;
  label: string;
  /** The ISO 4217 code the amount is in, shown beside what is typed. */
  currency: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

type MoneyInputProps = Pick<
  MoneyFieldProps,
  'currency' | 'disabled' | 'onChange' | 'placeholder'
> & {
  field: ReturnType<typeof useField<string>>;
};

// The input and its currency. The currency is part of what the field asks for,
// so it describes the input the way the help text and the error do, for whoever
// does not see it beside the input.
function MoneyInput({
  currency,
  disabled,
  field,
  onChange,
  placeholder,
}: MoneyInputProps) {
  const { errors, formDescriptionId, formMessageId } = useFormFieldContext();
  const currencyId = useId();
  const describedBy = [
    formDescriptionId,
    errors?.length ? formMessageId : undefined,
    currencyId,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative">
      <FormControl aria-describedby={describedBy}>
        <Input
          autoComplete="off"
          className="pr-14 tabular-nums"
          disabled={disabled}
          inputMode="decimal"
          onBlur={field.handleBlur}
          onChange={(event) => {
            field.handleChange(event.target.value);
            onChange?.(event.target.value);
          }}
          placeholder={placeholder}
          spellCheck={false}
          value={field.value ?? ''}
        />
      </FormControl>
      <span
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground"
        id={currencyId}
      >
        {currency}
      </span>
    </div>
  );
}

/**
 * An amount typed in major units (`0.075`), kept as the string it was typed as.
 * A `NumberField` holds a float, which loses the decimals of a price per sale
 * unit; this one hands the string to the schema, and to `majorToMinorDecimal`
 * (`@/lib/money`) when the form becomes a request body.
 */
const MoneyField = ({
  className,
  label,
  currency,
  required,
  placeholder,
  description,
  disabled,
  onChange,
}: MoneyFieldProps) => {
  return (
    <FormField<string>
      className={className}
      label={label}
      required={required}
      description={description}
      disabled={disabled}
    >
      {(field) => (
        <MoneyInput
          currency={currency}
          disabled={disabled}
          field={field}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </FormField>
  );
};

export default MoneyField;
