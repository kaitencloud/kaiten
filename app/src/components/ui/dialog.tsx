import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  );
}

// What a dialog is for, in DOM order: the first thing that takes input.
// Buttons are left out so a confirmation still lands on its own controls.
const FIRST_INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[role="combobox"]:not([disabled])',
  '[contenteditable="true"]',
].join(', ');

function DialogContent({
  className,
  children,
  overlayClassName,
  showCloseButton = true,
  variant = 'default',
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  showCloseButton?: boolean;
  variant?: 'default' | 'form';
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Radix focuses the first tabbable element, which is the close button
  // rendered right after the content: every form dialog opened on "Close".
  // Send the focus to the first input instead; a dialog without one keeps
  // the default. Route-driven dialogs mount their form behind Suspense, so
  // the input may not exist yet: watch the content for a moment and move the
  // focus when the input appears, unless the user has already moved on.
  function handleOpenAutoFocus(event: Event) {
    onOpenAutoFocus?.(event);

    const content = contentRef.current;

    if (event.defaultPrevented || !content) {
      return;
    }

    const firstInput = content.querySelector<HTMLElement>(FIRST_INPUT_SELECTOR);

    if (firstInput) {
      event.preventDefault();
      firstInput.focus();
      return;
    }

    const focusWhenInputAppears = () => {
      const input = content.querySelector<HTMLElement>(FIRST_INPUT_SELECTOR);

      if (!input) {
        return false;
      }

      const active = document.activeElement;
      const focusIsStillDefault =
        active === null ||
        active === document.body ||
        active === content ||
        active.closest('[data-slot="dialog-close"]') !== null;

      if (focusIsStillDefault) {
        input.focus();
      }

      return true;
    };

    const observer = new MutationObserver(() => {
      if (focusWhenInputAppears()) {
        stop();
      }
    });
    const timeout = window.setTimeout(() => stop(), 3000);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };

    observer.observe(content, { childList: true, subtree: true });
  }

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={contentRef}
        onOpenAutoFocus={handleOpenAutoFocus}
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          'group/dialog-content bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border shadow-lg duration-200 sm:max-w-lg',
          variant === 'form' ? 'gap-0 p-0' : 'gap-4 p-6',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col gap-2 text-center sm:text-left group-data-[variant=form]/dialog-content:gap-1.5 group-data-[variant=form]/dialog-content:border-b group-data-[variant=form]/dialog-content:bg-muted/50 group-data-[variant=form]/dialog-content:px-6 group-data-[variant=form]/dialog-content:py-4 group-data-[variant=form]/dialog-content:pr-10 group-data-[variant=form]/dialog-content:text-left',
        className,
      )}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        'min-h-0 flex-1 overflow-y-auto group-data-[variant=form]/dialog-content:px-6 group-data-[variant=form]/dialog-content:py-4',
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end group-data-[variant=form]/dialog-content:border-t group-data-[variant=form]/dialog-content:bg-muted/50 group-data-[variant=form]/dialog-content:px-6 group-data-[variant=form]/dialog-content:py-4',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
