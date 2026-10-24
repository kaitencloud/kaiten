import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type StepNextButtonProps = {
  children: ReactNode;
  /** The step is not complete: the button cannot open the next one. */
  disabled: boolean;
  onClick: () => void;
};

/**
 * The Next of a step that opens the following one only when every field of the step is valid.
 * While it is disabled it says why to whoever reads it, since a disabled button gives no hint of
 * its own and the field in error can be out of view: the description is a sentence for
 * assistive technology, and the fields show their own errors.
 */
export function StepNextButton({
  children,
  disabled,
  onClick,
}: StepNextButtonProps) {
  const { t } = useTranslation();
  const reasonId = useId();

  return (
    <>
      <Button
        aria-describedby={disabled ? reasonId : undefined}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </Button>
      {disabled ? (
        <span className="sr-only" id={reasonId}>
          {t('Common.nextBlocked')}
        </span>
      ) : null}
    </>
  );
}
