import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from './form-context';

type SubmitButtonProps = Omit<
  ComponentProps<typeof Button>,
  'children' | 'type'
> & {
  label: string;
  /**
   * Lets the form be submitted untouched. An edit form has nothing to save
   * until something changes, which is why that is the rule; a create form
   * whose defaults already make a complete submission (a new license version
   * pre-filled from its base) is the exception, and the caller that knows the
   * defaults are complete sets this.
   */
  allowPristine?: boolean;
};

const SubmitButton = ({
  allowPristine = false,
  disabled: disabledProp,
  label,
  ...props
}: SubmitButtonProps) => {
  const form = useFormContext();
  const { t } = useTranslation();

  return (
    <form.Subscribe
      selector={(state) => ({
        disabled:
          state.isValidating ||
          !state.isValid ||
          (!state.isDirty && !allowPristine) ||
          state.isSubmitting,
        isSubmitting: state.isSubmitting,
        // A greyed-out button explains nothing. Once the form has been
        // touched and is still invalid, say what is missing next to it.
        needsInput: state.isTouched && !state.isValid && !state.isSubmitting,
      })}
    >
      {({ disabled, isSubmitting, needsInput }) => (
        <>
          {needsInput ? (
            <span
              role="status"
              className="self-center text-xs text-muted-foreground"
            >
              {t('Common.requiredFieldsHint')}
            </span>
          ) : null}
          <Button {...props} type="submit" disabled={disabled || disabledProp}>
            {isSubmitting && (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            )}
            {label}
          </Button>
        </>
      )}
    </form.Subscribe>
  );
};

export default SubmitButton;
