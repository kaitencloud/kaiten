import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import { type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
import {
  useStepStackContext,
  useStepStackStepState,
} from '@/functionals/step-stack';
import { cn } from '@/lib/utils';
import { useStackedFormDialogContext } from './stacked-form-dialog-context';

export interface StackedFormDialogCardProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Field-placeholder count for this step's loading skeleton. */
  loadingFields?: number;
}

/**
 * A self-contained dialog card used inside a stacked `StepStack`. It repeats the
 * dialog header (same title + close) on every step and owns its own scrollable
 * body and footer, so the whole card stacks as a unit.
 */
export function StackedFormDialogCard({
  children,
  className,
  footer,
  loadingFields = 3,
}: StackedFormDialogCardProps) {
  const { t } = useTranslation();
  const { title, requestClose } = useStackedFormDialogContext();
  const { isActive } = useStepStackStepState();
  // Cards only ever stack inside a StepStack: the header says where in it.
  const { activeIndex, totalSteps } = useStepStackContext();
  // Inactive cards stay visible in the stack peek (shell + header), but their
  // body/footer content fades out so the peek stays clean.
  const fadedContent = cn(
    'transition-opacity duration-300',
    !isActive && 'opacity-0',
  );

  return (
    <div
      data-variant="form"
      className={cn(
        // h-full matters for the cards behind: a past step is given the
        // active step's height and clips what overflows, so a card sizing
        // itself taller loses its bottom border and rounded corners to that
        // clip. The active step has no definite height, where this resolves
        // to auto.
        'group/dialog-content relative flex h-full max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border bg-background shadow-lg',
        className,
      )}
    >
      <DialogHeader>
        <div className="text-lg leading-none font-semibold">{title}</div>
        {totalSteps > 1 ? (
          <div className="text-xs text-muted-foreground">
            {t('Common.stepOf', {
              current: activeIndex + 1,
              total: totalSteps,
            })}
          </div>
        ) : null}
      </DialogHeader>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-slot="dialog-close"
        className={cn(
          // Centred on the 50px header rather than the 12px inset every other
          // dialog uses for a bare icon: this one is a 36px button.
          'absolute top-[7px] right-4 text-muted-foreground hover:text-foreground',
          fadedContent,
        )}
        aria-label={t('Common.close')}
        onClick={requestClose}
      >
        <XIcon className="size-4" />
      </Button>

      <DialogBody className={fadedContent}>
        <Suspense fallback={<DialogFormSkeleton fields={loadingFields} />}>
          {children}
        </Suspense>
      </DialogBody>

      {footer ? (
        <DialogFooter className={fadedContent}>{footer}</DialogFooter>
      ) : null}
    </div>
  );
}
