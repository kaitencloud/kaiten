import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';
import { StatCard } from '../stat-card';

const cards = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="stat-card"]');

describe('StatCard', () => {
  it('renders its label, value and helpers', () => {
    render(
      <StatCard>
        <StatCard.Label>License expires</StatCard.Label>
        <StatCard.Icon>
          <Activity />
        </StatCard.Icon>
        <StatCard.Value>Oct 1, 2027</StatCard.Value>
        <StatCard.Helper>in 12 months</StatCard.Helper>
        <StatCard.Helper>renewal pending</StatCard.Helper>
      </StatCard>,
    );

    expect(screen.getByText('License expires')).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2027')).toBeInTheDocument();
    expect(screen.getByText('in 12 months')).toBeInTheDocument();
    expect(screen.getByText('renewal pending')).toBeInTheDocument();
  });

  it('renders two values at the same size, each with its unit', () => {
    render(
      <StatCard>
        <StatCard.Label>Usage alerts</StatCard.Label>
        <StatCard.Value>
          2<StatCard.Unit>near limit</StatCard.Unit>
        </StatCard.Value>
        <StatCard.Value>
          1<StatCard.Unit>limit reached</StatCard.Unit>
        </StatCard.Value>
      </StatCard>,
    );

    const [near, reached] = screen
      .getAllByText(/near limit|limit reached/)
      .map((unit) => unit.closest('[data-slot="stat-card-value"]'));
    expect(near).toHaveTextContent('2near limit');
    expect(reached).toHaveTextContent('1limit reached');
    expect(near?.className).toBe(reached?.className);
  });

  it('applies a tone given on a part', () => {
    render(
      <StatCard>
        <StatCard.Label>Card</StatCard.Label>
        <StatCard.Value className="text-success-subtle-foreground">
          99
        </StatCard.Value>
      </StatCard>,
    );

    expect(screen.getByText('99')).toHaveClass(
      'text-success-subtle-foreground',
    );
  });

  it('is not dense unless asked', () => {
    const { container } = render(
      <>
        <StatCard>
          <StatCard.Value>1</StatCard.Value>
        </StatCard>
        <StatCard dense>
          <StatCard.Value>2</StatCard.Value>
        </StatCard>
      </>,
    );

    const [regular, dense] = cards(container);
    expect(regular).not.toHaveAttribute('data-dense');
    expect(dense).toHaveAttribute('data-dense');
  });
});

describe('StatCard.Row', () => {
  it('lays cards out on two columns from md and four from xl', () => {
    const { container } = render(
      <StatCard.Row>
        <StatCard>
          <StatCard.Value>1</StatCard.Value>
        </StatCard>
      </StatCard.Row>,
    );

    const row = container.querySelector(
      '[data-slot="stat-card-row"]',
    ) as HTMLElement;
    expect(row).toHaveClass('md:grid-cols-2');
    expect(row).toHaveClass('xl:grid-cols-4');
  });

  it('takes its own columns', () => {
    const { container } = render(
      <StatCard.Row columnsClassName="md:grid-cols-3">
        <StatCard>
          <StatCard.Value>1</StatCard.Value>
        </StatCard>
      </StatCard.Row>,
    );

    const row = container.querySelector(
      '[data-slot="stat-card-row"]',
    ) as HTMLElement;
    expect(row).toHaveClass('md:grid-cols-3');
    expect(row).not.toHaveClass('xl:grid-cols-4');
  });

  it('makes every card dense when the row is', () => {
    const { container } = render(
      <StatCard.Row dense>
        <StatCard>
          <StatCard.Value>1</StatCard.Value>
        </StatCard>
        <StatCard>
          <StatCard.Value>2</StatCard.Value>
        </StatCard>
      </StatCard.Row>,
    );

    for (const card of cards(container)) {
      expect(card).toHaveAttribute('data-dense');
    }
  });
});
