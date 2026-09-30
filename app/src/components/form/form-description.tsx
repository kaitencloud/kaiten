import { cn } from '@/lib/utils';
import { useFormFieldContext } from './form-context';

function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormFieldContext();
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-[0.8rem]', className)}
      {...props}
    />
  );
}

export default FormDescription;
