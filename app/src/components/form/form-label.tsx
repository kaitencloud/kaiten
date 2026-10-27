import type { ComponentProps } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useFormFieldContext } from './form-context';

type FormLabelProps = ComponentProps<typeof Label>;

function FormLabel({ className, ...props }: FormLabelProps) {
  const { formItemId, formLabelId, errors } = useFormFieldContext();
  const hasError = Boolean(errors?.length);

  return (
    <Label
      data-slot="form-label"
      data-invalid={hasError || undefined}
      className={cn(
        'group-data-[invalid=true]/form-item:text-destructive-subtle-foreground data-[invalid=true]:text-destructive-subtle-foreground',
        className,
      )}
      id={formLabelId}
      htmlFor={formItemId}
      {...props}
    />
  );
}

export default FormLabel;
