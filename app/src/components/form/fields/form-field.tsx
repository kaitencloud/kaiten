import type { ReactNode } from 'react';
import useField from '@/components/form/fields/use-field';
import FormDescription from '@/components/form/form-description';
import FormItem from '@/components/form/form-item';
import FormLabel from '@/components/form/form-label';
import FormMessage from '@/components/form/form-message';
import RequiredMark from '@/components/form/required-mark';

type FormFieldProps<T = unknown> = {
  className?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  /** Marks the label and sets aria-required on the control. */
  required?: boolean;
  children: (field: ReturnType<typeof useField<T>>) => ReactNode;
};

function FormField<T = unknown>(props: FormFieldProps<T>) {
  const { className, label, description, disabled, required } = props;
  const field = useField<T>();
  const visibleErrors = field.hasError ? field.errors : undefined;

  return (
    <FormItem
      className={className}
      errors={visibleErrors}
      required={required}
      aria-disabled={disabled}
      data-field-name={field.name}
    >
      {label && (
        <div className="flex items-center gap-1">
          <FormLabel>{label}</FormLabel>
          {required ? <RequiredMark /> : null}
        </div>
      )}
      {props.children(field)}
      {description && !field.hasError && (
        <FormDescription>{description}</FormDescription>
      )}
      <FormMessage>
        {field.hasError ? field.errorMessage : undefined}
      </FormMessage>
    </FormItem>
  );
}

export default FormField;
