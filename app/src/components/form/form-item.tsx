import type { HTMLAttributes } from 'react';
import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { type FormError, FormItemContext } from './form-context';

type FormItemProps = HTMLAttributes<HTMLDivElement> & {
  errors?: FormError[];
  required?: boolean;
};

function FormItem({ className, errors, required, ...props }: FormItemProps) {
  const id = useId();
  const hasError = Boolean(errors?.length);

  const contextValue = useMemo(
    () => ({ id, errors, required }),
    [id, errors, required],
  );

  return (
    <FormItemContext.Provider value={contextValue}>
      <div
        data-slot="form-item"
        data-invalid={hasError || undefined}
        data-required={required || undefined}
        data-disabled={props['aria-disabled'] || undefined}
        className={cn('group/form-item grid gap-2', className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

export default FormItem;
