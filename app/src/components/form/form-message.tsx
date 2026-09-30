import { cn } from '@/lib/utils';
import { useFormFieldContext } from './form-context';

function FormMessage({
  className,
  children,
  ...props
}: React.ComponentProps<'p'>) {
  const { formMessageId, errors } = useFormFieldContext();

  // Prioritize children (translated message) over errors (raw message)
  const body =
    children ??
    (errors?.length ? String(errors?.at(0)?.message ?? '') : undefined);

  if (!body) return null;

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn(
        'text-destructive-subtle-foreground text-[0.8rem] font-medium',
        className,
      )}
      {...props}
    >
      {body}
    </p>
  );
}

export default FormMessage;
