import { Slot } from '@/components/ui/slot';
import { useFormFieldContext } from './form-context';

type FormControlProps = React.ComponentProps<typeof Slot> & {
  /**
   * Whether `aria-required` goes on the control when the field is required.
   * ARIA allows it on inputs, comboboxes and checkboxes, and refuses it on a
   * button or a bare container: a control that renders one of those passes
   * `false`, and axe's `aria-allowed-attr` fails the screen otherwise.
   */
  announceRequired?: boolean;
};

function FormControl({ announceRequired = true, ...props }: FormControlProps) {
  const { formItemId, formDescriptionId, formMessageId, errors, required } =
    useFormFieldContext();
  const hasError = Boolean(errors?.length);

  return (
    <Slot
      data-slot="form-control"
      data-invalid={hasError || undefined}
      id={formItemId}
      aria-describedby={
        hasError ? `${formDescriptionId} ${formMessageId}` : formDescriptionId
      }
      aria-invalid={hasError}
      aria-required={(announceRequired && required) || undefined}
      {...props}
    />
  );
}

export default FormControl;
