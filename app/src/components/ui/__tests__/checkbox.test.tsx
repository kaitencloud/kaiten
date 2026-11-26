import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Checkbox } from '../checkbox';

describe('Checkbox', () => {
  it('draws a check and reads as checked when it is checked', () => {
    render(<Checkbox aria-label="Group" checked />);

    const checkbox = screen.getByRole('checkbox', { name: 'Group' });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(checkbox.querySelector('.lucide-check')).not.toBeNull();
    expect(checkbox.querySelector('.lucide-minus')).toBeNull();
  });

  it('draws a minus and reads as mixed when it is indeterminate', () => {
    render(<Checkbox aria-label="Group" checked={false} indeterminate />);

    const checkbox = screen.getByRole('checkbox', { name: 'Group' });
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    expect(checkbox).toHaveAttribute('data-indeterminate');
    expect(checkbox.querySelector('.lucide-minus')).not.toBeNull();
    expect(checkbox.querySelector('.lucide-check')).toBeNull();
  });

  it('asks to be checked when an indeterminate box is clicked', () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        aria-label="Group"
        checked={false}
        indeterminate
        onCheckedChange={onCheckedChange}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Group' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it('draws nothing when it is unchecked', () => {
    render(<Checkbox aria-label="Group" checked={false} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Group' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(checkbox.querySelector('svg')).toBeNull();
  });
});
