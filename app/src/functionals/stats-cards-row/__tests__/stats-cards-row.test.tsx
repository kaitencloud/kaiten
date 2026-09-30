import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';
import { StatsCardsRow } from '../stats-cards-row';

const helperSlots = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="stat-card-helper"]');

describe('StatsCardsRow', () => {
  it('renders all cards', () => {
    render(
      <StatsCardsRow
        items={[
          { id: 'one', label: 'Card One', value: 12, Icon: Activity },
          { id: 'two', label: 'Card Two', value: 'active' },
        ]}
      />,
    );

    expect(screen.getByText('Card One')).toBeInTheDocument();
    expect(screen.getByText('Card Two')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('lays four cards out on two columns from md and four from xl', () => {
    const { container } = render(
      <StatsCardsRow items={[{ id: 'one', label: 'Card', value: 1 }]} />,
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(grid).toHaveClass('xl:grid-cols-4');
  });

  it('applies custom grid class', () => {
    const { container } = render(
      <StatsCardsRow
        columnsClassName="md:grid-cols-3"
        items={[{ id: 'one', label: 'Card', value: 1 }]}
      />,
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveClass('md:grid-cols-3');
    expect(grid).not.toHaveClass('xl:grid-cols-4');
  });

  it('applies custom value class', () => {
    render(
      <StatsCardsRow
        items={[
          {
            id: 'one',
            label: 'Card',
            value: 99,
            valueClassName: 'text-success-subtle-foreground',
          },
        ]}
      />,
    );

    expect(screen.getByText('99')).toHaveClass(
      'text-success-subtle-foreground',
    );
  });

  it('renders helper text when provided', () => {
    render(
      <StatsCardsRow
        items={[
          {
            id: 'one',
            label: 'Card',
            value: 42,
            helper: '2 rollout-based rules',
          },
        ]}
      />,
    );

    expect(screen.getByText('2 rollout-based rules')).toBeInTheDocument();
  });

  // The values share one line across the row: a card without a helper keeps
  // the helper's line empty rather than letting its value drop into it.
  it('keeps the helper line on every card once one card has a helper', () => {
    const { container } = render(
      <StatsCardsRow
        items={[
          { id: 'one', label: 'Card', value: 1, helper: 'with a helper' },
          { id: 'two', label: 'Card', value: 2 },
          { id: 'three', label: 'Card', value: 3 },
        ]}
      />,
    );

    expect(helperSlots(container)).toHaveLength(3);
  });

  it('spends no line on helpers when no card has one', () => {
    const { container } = render(
      <StatsCardsRow
        items={[
          { id: 'one', label: 'Card', value: 1 },
          { id: 'two', label: 'Card', value: 2 },
        ]}
      />,
    );

    expect(helperSlots(container)).toHaveLength(0);
  });
});
