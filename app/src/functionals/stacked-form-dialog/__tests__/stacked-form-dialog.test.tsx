import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
} from '../stacked-form-dialog';
import {
  StackedFormDialogDirtyState,
  useStackedFormDialogClose,
} from '../stacked-form-dialog-context';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

let dialogOnOpenChange: ((open: boolean) => void) | undefined;

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => {
    dialogOnOpenChange = onOpenChange;
    return (
      <div>
        <button type="button" onClick={() => onOpenChange(false)}>
          overlay-close
        </button>
        {children}
      </div>
    );
  },
  DialogContent: ({
    children,
    className,
    variant,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => (
    <div
      className={className}
      data-testid="dialog-content"
      data-variant={variant}
    >
      <button type="button" onClick={() => dialogOnOpenChange?.(false)}>
        Close
      </button>
      {children}
    </div>
  ),
  DialogBody: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="dialog-body" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="dialog-footer">
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('StackedFormDialog', () => {
  it('uses the discard confirmation flow by default', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <StackedFormDialog open onOpenChange={onOpenChange} title="Dialog title">
        <div>content</div>
      </StackedFormDialog>,
    );

    expect(screen.getByTestId('dialog-content')).toHaveAttribute(
      'data-variant',
      'form',
    );
    expect(screen.getByTestId('dialog-content')).toHaveClass('sm:max-w-lg');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Common.discardFormChangesConfirm',
      }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes immediately when confirmOnClose is disabled', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <StackedFormDialog
        confirmOnClose={false}
        open
        onOpenChange={onOpenChange}
        title="Dialog title"
      >
        <div>content</div>
      </StackedFormDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'overlay-close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
  });

  it('hides the footer when no actions are registered', () => {
    render(
      <StackedFormDialog open onOpenChange={vi.fn()} title="Dialog title">
        <div>content</div>
      </StackedFormDialog>,
    );

    expect(screen.getByTestId('dialog-footer')).toHaveClass('hidden');
  });

  it('slots footer actions and submits their associated form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => {
      event.preventDefault();
    });

    render(
      <StackedFormDialog open onOpenChange={vi.fn()} title="Dialog title">
        <form id="stacked-test-form" onSubmit={onSubmit}>
          <StackedFormDialogFooter>
            <button type="submit" form="stacked-test-form">
              Save
            </button>
          </StackedFormDialogFooter>
        </form>
      </StackedFormDialog>,
    );

    const saveButton = await screen.findByRole('button', { name: 'Save' });

    expect(screen.getByTestId('dialog-footer')).not.toHaveClass('hidden');
    expect(saveButton).toHaveAttribute('form', 'stacked-test-form');

    await user.click(saveButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes without asking when the form reports nothing to lose', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <StackedFormDialog open onOpenChange={onOpenChange} title="Dialog title">
        <StackedFormDialogDirtyState dirty={false} />
      </StackedFormDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
  });

  it('asks before closing once the form has changes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <StackedFormDialog open onOpenChange={onOpenChange} title="Dialog title">
        <StackedFormDialogDirtyState dirty />
      </StackedFormDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
  });

  it('lets a step close the dialog the way its close button does', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    function StepCancel() {
      const requestClose = useStackedFormDialogClose();

      return (
        <button type="button" onClick={requestClose}>
          Cancel step
        </button>
      );
    }

    render(
      <StackedFormDialog open onOpenChange={onOpenChange} title="Dialog title">
        <StackedFormDialogDirtyState dirty={false} />
        <StepCancel />
      </StackedFormDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel step' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
