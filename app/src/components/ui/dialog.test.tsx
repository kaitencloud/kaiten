import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

function TestDialog({ variant }: { variant?: 'default' | 'form' }) {
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} variant={variant}>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
        </DialogHeader>
        <DialogBody>Dialog body</DialogBody>
        <DialogFooter>Dialog footer</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('DialogContent', () => {
  it('keeps the default dialog chrome', () => {
    render(<TestDialog />);

    const content = screen.getByRole('dialog');
    const header = content.querySelector('[data-slot="dialog-header"]');

    expect(content).toHaveAttribute('data-variant', 'default');
    expect(content).toHaveClass('gap-4', 'p-6');
    expect(content).not.toHaveClass('gap-0', 'p-0');
    expect(header).not.toHaveClass('border-b', 'bg-muted/50', 'px-6');
  });

  it('provides the form header, scrollable body and footer zones', () => {
    render(<TestDialog variant="form" />);

    const content = screen.getByRole('dialog');
    const header = content.querySelector('[data-slot="dialog-header"]');
    const body = content.querySelector('[data-slot="dialog-body"]');
    const footer = content.querySelector('[data-slot="dialog-footer"]');

    expect(content).toHaveAttribute('data-variant', 'form');
    expect(content).toHaveClass(
      'flex',
      'max-h-[90vh]',
      'flex-col',
      'gap-0',
      'overflow-hidden',
      'p-0',
    );
    expect(header?.className).toContain(
      'group-data-[variant=form]/dialog-content:border-b',
    );
    expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(body?.className).toContain(
      'group-data-[variant=form]/dialog-content:px-6',
    );
    expect(footer?.className).toContain(
      'group-data-[variant=form]/dialog-content:border-t',
    );
  });
});
