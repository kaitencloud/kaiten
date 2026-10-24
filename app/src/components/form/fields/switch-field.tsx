import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Switch } from '@/components/ui/switch';

type SwitchFieldProps = {
  className?: string;
  description?: string;
  /** A switch that cannot be turned on; the description, which the switch points to, says why. */
  disabled?: boolean;
  label: string;
};

/**
 * A boolean the person turns on or off, with the label above it and the description
 * below, as the other fields lay themselves out. A checkbox is for agreeing to
 * something; this is for a setting that takes effect: it is `CheckboxField`'s sibling
 * for a value that reads "on" and "off".
 */
const SwitchField = ({
  className,
  description,
  disabled,
  label,
}: SwitchFieldProps) => (
  <FormField<boolean>
    className={className}
    description={description}
    disabled={disabled}
    label={label}
  >
    {(field) => (
      <FormControl announceRequired={false}>
        <Switch
          aria-label={label}
          aria-invalid={field.hasError}
          checked={field.value}
          disabled={disabled}
          onBlur={field.handleBlur}
          onCheckedChange={(checked) => {
            field.handleChange(checked);
            field.handleBlur();
          }}
        />
      </FormControl>
    )}
  </FormField>
);

export default SwitchField;
