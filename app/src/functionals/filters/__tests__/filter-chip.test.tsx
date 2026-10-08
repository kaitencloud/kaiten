import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { FilterChip } from '../components/shared/filter-chip';

describe('FilterChip', () => {
  it('shows what it says, and names the button that takes it off for a screen reader', () => {
    render(
      <FilterChip onRemove={vi.fn()} removeLabel="Remove the filter Status">
        <span>Status: Paid</span>
      </FilterChip>,
    );

    expect(screen.getByText('Status: Paid')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove the filter Status' }),
    ).toBeVisible();
  });

  it('takes itself off when the button is pressed, and not when what it says is', async () => {
    const onRemove = vi.fn();
    render(
      <FilterChip onRemove={onRemove} removeLabel="Remove">
        <button type="button">Status: Paid</button>
      </FilterChip>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Status: Paid' }));
    expect(onRemove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('carries the data-slot that the specs find the chips of a toolbar by', () => {
    const { container } = render(
      <FilterChip onRemove={vi.fn()} removeLabel="Remove">
        <span>Customer: acme</span>
      </FilterChip>,
    );

    expect(container.querySelector('[data-slot="filter-chip"]')).toHaveTextContent(
      'Customer: acme',
    );
  });
});
