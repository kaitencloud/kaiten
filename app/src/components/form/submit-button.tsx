import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useRef, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormContext } from './form-context';
import { useSubmitFocus } from './use-submit-focus';

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

type SubmitButtonState = {
  disabled: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  needsInput: boolean;
};

type SubmitControlsProps = Omit<SubmitButtonProps, 'allowPristine'> & {
  state: SubmitButtonState;
};

const SubmitControls = ({
  disabled: disabledProp,
  label,
  ref,
  state,
  ...props
}: SubmitControlsProps) => {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const setButton = useCallback(
    (element: HTMLButtonElement | null) => {
      buttonRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );
  useSubmitFocus(buttonRef, state);

  return (
    <>
      {state.needsInput ? (
        <span
          role="status"
          className="self-center text-xs text-muted-foreground"
        >
          {t('Common.requiredFieldsHint')}
        </span>
      ) : null}
      <Button
        {...props}
        ref={setButton}
        type="submit"
        disabled={state.disabled || disabledProp}
      >
        {state.isSubmitting && (
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        )}
        {label}
      </Button>
    </>
  );
};

const SubmitButton = ({
  allowPristine = false,
  ...props
}: SubmitButtonProps) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state): SubmitButtonState => ({
        disabled:
          state.isValidating ||
          !state.isValid ||
          (!state.isDirty && !allowPristine) ||
          state.isSubmitting,
        isSubmitting: state.isSubmitting,
        isValid: state.isValid,
        isValidating: state.isValidating,
        // A greyed-out button explains nothing. Once the form has been
        // touched and is still invalid, say what is missing next to it.
        needsInput: state.isTouched && !state.isValid && !state.isSubmitting,
      })}
    >
      {(state) => <SubmitControls {...props} state={state} />}
    </form.Subscribe>
  );
};

export default SubmitButton;
