import { type ComponentProps, type ReactNode, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DialogFormSkeleton } from './dialog-form-skeleton';

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Width/layout overrides for the dialog panel (defaults to `sm:max-w-lg`). */
  className?: string;
  onInteractOutside?: (e: Event) => void;
}

/**
 * FormDialog - composition-based dialog shell for forms
 *
 * Fixed header and footer, scrollable content, max height of 90vh.
 *
 * Usage:
 * ```tsx
 * <FormDialog open={open} onOpenChange={setOpen} className="sm:max-w-5xl">
 *   <FormDialog.Header>
 *     <FormDialog.Title>My Form</FormDialog.Title>
 *     <FormDialog.Description>Fill out the form</FormDialog.Description>
 *   </FormDialog.Header>
 *   <FormDialog.Content>
 *     <YourFormContent />
 *   </FormDialog.Content>
 *   <FormDialog.Footer>
 *     <Button>Submit</Button>
 *   </FormDialog.Footer>
 * </FormDialog>
 * ```
 */
function Root({
  open,
  onOpenChange,
  children,
  className,
  onInteractOutside,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('flex max-h-[90vh] flex-col sm:max-w-lg', className)}
        onInteractOutside={onInteractOutside}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Header({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn('shrink-0', className)} {...props} />;
}

function Content({
  className,
  children,
  loadingFields = 3,
}: {
  className?: string;
  children: ReactNode;
  /** Field-placeholder count for the loading skeleton (defaults to 3). */
  loadingFields?: number;
}) {
  return (
    <div
      className={cn(
        'no-scrollbar -mx-6 flex-1 overflow-y-auto px-6',
        className,
      )}
    >
      <Suspense
        fallback={
          <DialogFormSkeleton fields={loadingFields} className="space-y-4" />
        }
      >
        <div className="space-y-4">{children}</div>
      </Suspense>
    </div>
  );
}

function Footer({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn('shrink-0', className)} {...props} />;
}

export const FormDialog = Object.assign(Root, {
  Header,
  Title: DialogTitle,
  Description: DialogDescription,
  Content,
  Footer,
});
