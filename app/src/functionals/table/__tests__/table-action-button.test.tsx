import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TableActionButton } from '..';

describe('TableActionButton', () => {
  it('should render with tooltip', async () => {
    const user = userEvent.setup();
    render(
      <TableActionButton tooltip="Edit item">
        <span>Edit</span>
      </TableActionButton>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();

    await user.hover(button);
    // Tooltip appears multiple times (visible + hidden for accessibility)
    const tooltips = await screen.findAllByText('Edit item');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('should show tooltip even when disabled', async () => {
    const user = userEvent.setup();
    render(
      <TableActionButton tooltip="Cannot delete yet" disabled>
        <span>Delete</span>
      </TableActionButton>,
    );

    const trigger = screen.getByRole('button').parentElement;
    expect(trigger).toBeInTheDocument();

    await user.hover(trigger!);

    const tooltips = await screen.findAllByText('Cannot delete yet');
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it('should render children', () => {
    render(
      <TableActionButton tooltip="Test tooltip">
        <span>Test Content</span>
      </TableActionButton>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply correct button styles', () => {
    render(
      <TableActionButton tooltip="Test">
        <span>Content</span>
      </TableActionButton>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('h-8', 'w-8', 'p-0');
  });

  it('should call onClick when clicked and not asChild', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <TableActionButton tooltip="Click me" onClick={handleClick}>
        <span>Click</span>
      </TableActionButton>,
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when asChild is true', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <TableActionButton tooltip="Click me" onClick={handleClick} asChild nativeButton role="button">
        <button type="button">Custom Button</button>
      </TableActionButton>,
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should stop propagation on wrapper click', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick} role="presentation">
        <TableActionButton tooltip="Test">
          <span>Content</span>
        </TableActionButton>
      </div>,
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(parentClick).not.toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    render(
      <TableActionButton tooltip="Test" className="custom-class">
        <span>Content</span>
      </TableActionButton>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = vi.fn();

    render(
      <TableActionButton tooltip="Test" ref={ref}>
        <span>Content</span>
      </TableActionButton>,
    );

    expect(ref).toHaveBeenCalled();
  });
});
