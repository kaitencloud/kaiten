import { Slot } from '@/components/ui/slot';
import { useFormFieldContext } from './form-context';

function FormControl(props: React.ComponentProps<typeof Slot>) {
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
      aria-required={required || undefined}
      {...props}
    />
  );
}

export default FormControl;
