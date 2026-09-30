import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  Suspense,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DialogFormSkeleton,
  DialogFormSkeletonCard,
} from '@/components/dialog/dialog-form-skeleton';
import {
  useStepStackContext,
  useStepStackStepState,
} from '@/functionals/step-stack';
import { cn } from '@/lib/utils';
import { DiscardChangesDialog } from './discard-changes-dialog';
import {
  StackedFormDialogContext,
  type StackedFormDialogContextValue,
  useStackedFormDialogContext,
} from './stacked-form-dialog-context';

type StackedFormDialogFooterPortalContextValue = {
  node: HTMLDivElement | null;
  registerSlot: () => void;
  unregisterSlot: () => void;
};

const StackedFormDialogFooterPortalContext =
  createContext<StackedFormDialogFooterPortalContextValue | null>(null);

export function StackedFormDialogFooter({ children }: { children: ReactNode }) {
  const context = use(StackedFormDialogFooterPortalContext);

  useLayoutEffect(() => {
    if (!context) {
      return;
    }

    context.registerSlot();
    return () => {
      context.unregisterSlot();
    };
  }, [context]);

  if (!context?.node) {
    return null;
  }

  return createPortal(children, context.node);
}

export interface StackedFormDialogProps {
  children: ReactNode;
  className?: string;
  confirmOnClose?: boolean;
  description?: ReactNode;
  footer?: ReactNode;
  /** Field-placeholder count for the loading skeleton (per step for stacked). */
  loadingFields?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When true, the dialog becomes a transparent, overflow-visible stage so each
   * step rendered through `StackedFormDialogCard` can stack and peek behind the
   * active card (multi-step wizard). When false (default), a single delimited
   * header/body/footer panel is rendered.
   */
  stacked?: boolean;
  title: string;
}

export interface StackedFormDialogPanelProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export function StackedFormDialogPanel({
  children,
  className,
  footer,
}: StackedFormDialogPanelProps) {
  return (
    <div className={cn('mx-auto w-full', className)}>
      {children}
      {footer ? (
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

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

export function StackedFormDialog({
  children,
  className,
  confirmOnClose = true,
  description,
  footer,
  loadingFields = 3,
  onOpenChange,
  open,
  stacked = false,
  title,
}: StackedFormDialogProps) {
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  // Reported by the form inside (StackedFormDialogDirtyState). Unknown means
  // closing asks.
  const [isDirty, setIsDirty] = useState<boolean | undefined>(undefined);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setConfirmCloseOpen(false);
    }
  }
  const [footerPortalNode, setFooterPortalNode] =
    useState<HTMLDivElement | null>(null);
  const [hasSlottedFooter, setHasSlottedFooter] = useState(false);
  const showFooter = footer != null || hasSlottedFooter;
  const contentProps = description
    ? {}
    : ({ 'aria-describedby': undefined } as const);

  const registerSlot = useCallback(() => {
    setHasSlottedFooter(true);
  }, []);

  const unregisterSlot = useCallback(() => {
    setHasSlottedFooter(false);
  }, []);

  const footerPortalContext =
    useMemo<StackedFormDialogFooterPortalContextValue>(
      () => ({
        node: footerPortalNode,
        registerSlot,
        unregisterSlot,
      }),
      [footerPortalNode, registerSlot, unregisterSlot],
    );

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }

      if (!confirmOnClose || isDirty === false) {
        onOpenChange(false);
        return;
      }

      setConfirmCloseOpen(true);
    },
    [confirmOnClose, isDirty, onOpenChange],
  );

  const dialogContext = useMemo<StackedFormDialogContextValue>(
    () => ({
      title,
      requestClose: () => handleDialogOpenChange(false),
      setDirty: setIsDirty,
    }),
    [title, handleDialogOpenChange],
  );

  return (
    <StackedFormDialogContext.Provider value={dialogContext}>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        {stacked ? (
          <DialogContent
            {...contentProps}
            showCloseButton={false}
            overlayClassName="bg-black/60"
            className={cn(
              'max-h-none max-w-[min(96vw,1400px)] gap-0 overflow-visible border-none bg-transparent p-0 shadow-none',
              className,
            )}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : null}
            </DialogHeader>

            <Suspense
              fallback={
                <DialogFormSkeletonCard fields={loadingFields} title={title} />
              }
            >
              {children}
            </Suspense>
          </DialogContent>
        ) : (
          <DialogContent
            {...contentProps}
            className={cn('sm:max-w-lg', className)}
            variant="form"
          >
            <StackedFormDialogFooterPortalContext.Provider
              value={footerPortalContext}
            >
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                {description ? (
                  <DialogDescription>{description}</DialogDescription>
                ) : null}
              </DialogHeader>

              <DialogBody>
                <Suspense
                  fallback={<DialogFormSkeleton fields={loadingFields} />}
                >
                  {children}
                </Suspense>
              </DialogBody>

              <DialogFooter className={cn(!showFooter && 'hidden')}>
                {footer}
                <div ref={setFooterPortalNode} className="contents" />
              </DialogFooter>
            </StackedFormDialogFooterPortalContext.Provider>
          </DialogContent>
        )}
      </Dialog>

      <DiscardChangesDialog
        open={confirmOnClose && confirmCloseOpen}
        onOpenChange={setConfirmCloseOpen}
        onConfirm={() => onOpenChange(false)}
      />
    </StackedFormDialogContext.Provider>
  );
}
