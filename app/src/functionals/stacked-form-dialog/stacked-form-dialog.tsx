import {
  createContext,
  type ReactNode,
  type ComponentProps,
  Suspense,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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
import { cn } from '@/lib/utils';
import { DiscardChangesDialog } from './discard-changes-dialog';
import {
  StackedFormDialogContext,
  type StackedFormDialogContextValue,
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
  finalFocus?: ComponentProps<typeof DialogContent>['finalFocus'];
  /**
   * Where the focus lands when the dialog opens: a creation form that offers back an
   * unsent input puts it on its "Resume" button. The first field by default.
   */
  initialFocus?: ComponentProps<typeof DialogContent>['initialFocus'];
  /**
   * Called when the person confirms that the changes are to be discarded: a creation
   * form that keeps its unsent input on the device drops it then, whereas a dialog left
   * by a navigation keeps it.
   */
  onDiscard?: () => void;
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
  finalFocus,
  initialFocus,
  onDiscard,
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
            finalFocus={finalFocus}
            initialFocus={initialFocus}
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
            finalFocus={finalFocus}
            initialFocus={initialFocus}
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
        onConfirm={() => {
          onDiscard?.();
          onOpenChange(false);
        }}
      />
    </StackedFormDialogContext.Provider>
  );
}
