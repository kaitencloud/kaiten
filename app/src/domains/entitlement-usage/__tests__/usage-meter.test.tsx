import { render } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { UsageMeter } from '../components/usage-meter';

const segment = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`[data-segment="${name}"]`);
const percent = (value: string | undefined) => Number.parseFloat(value ?? '');

describe('UsageMeter', () => {
  it('ends the track at a hard limit, with no tick for the grant', () => {
    const { container } = render(<UsageMeter threshold={250} value={250} />);

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'AT_LIMIT',
    );
    expect(segment(container, 'band')).toBeNull();
    expect(percent(segment(container, 'contract')?.style.width)).toBe(100);
    expect(segment(container, 'contract')).toHaveClass('bg-destructive');
    expect(segment(container, 'grant')).toBeNull();
  });

  it('draws the tolerated overage after the grant, even while unused', () => {
    const { container } = render(
      <UsageMeter
        limitCapExceededOveragePercent={20}
        threshold={250}
        value={100}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'HEALTHY',
    );
    expect(percent(segment(container, 'band')?.style.left)).toBeCloseTo(
      83.33,
      1,
    );
    expect(segment(container, 'grant')?.style.left).toMatch(/^calc\(83\.33/);
    expect(percent(segment(container, 'contract')?.style.width)).toBeCloseTo(
      33.33,
      1,
    );
    expect(segment(container, 'allowance')).toBeNull();
  });

  it('fills the band in the alert colour once usage passes the grant', () => {
    const { container } = render(
      <UsageMeter
        limitCapExceededOveragePercent={20}
        threshold={250}
        value={274}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'IN_ALLOWANCE',
    );
    expect(segment(container, 'contract')).toHaveClass('bg-success');
    expect(percent(segment(container, 'contract')?.style.width)).toBeCloseTo(
      83.33,
      1,
    );
    expect(segment(container, 'allowance')).toHaveClass('bg-warning');
    expect(percent(segment(container, 'allowance')?.style.left)).toBeCloseTo(
      83.33,
      1,
    );
    expect(percent(segment(container, 'allowance')?.style.width)).toBeCloseTo(
      8,
      1,
    );
  });

  it('fills the whole track in red past the wall', () => {
    const { container } = render(
      <UsageMeter
        limitCapExceededOveragePercent={20}
        threshold={250}
        value={312}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'OVER_LIMIT',
    );
    expect(segment(container, 'contract')).toHaveClass('bg-destructive');
    expect(segment(container, 'allowance')).toHaveClass('bg-destructive');
    expect(
      percent(segment(container, 'contract')?.style.width) +
        percent(segment(container, 'allowance')?.style.width),
    ).toBeCloseTo(100, 5);
  });

  it('draws nothing without a ceiling', () => {
    expect(
      render(
        <UsageMeter
          limitCapExceededOveragePercent={-1}
          threshold={-1}
          value={1840}
        />,
      ).container.firstChild,
    ).toBeNull();
    expect(
      render(<UsageMeter threshold={null} value={12} />).container.firstChild,
    ).toBeNull();
  });

  it('reads a grant of nothing as full from the first unit', () => {
    const { container } = render(<UsageMeter threshold={0} value={1} />);

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'OVER_LIMIT',
    );
    expect(percent(segment(container, 'contract')?.style.width)).toBe(100);
  });

  it('draws no allowance on a grant of nothing, whatever its percentage', () => {
    const { container } = render(
      <UsageMeter limitCapExceededOveragePercent={20} threshold={0} value={1} />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-status',
      'OVER_LIMIT',
    );
    expect(segment(container, 'band')).toBeNull();
    expect(segment(container, 'grant')).toBeNull();
    expect(segment(container, 'allowance')).toBeNull();
    expect(percent(segment(container, 'contract')?.style.width)).toBe(100);
  });
});
