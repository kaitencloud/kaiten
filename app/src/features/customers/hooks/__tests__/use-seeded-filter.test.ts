import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useSeededFilter } from '../use-seeded-filter';

const addFilter = vi.fn();
const setValue = vi.fn();
const onSeedDropped = vi.fn();

type Props = {
  active?: boolean;
  seed?: string;
  value?: string;
};

function mount(initial: Props) {
  return renderHook(
    ({ active = false, seed, value = '' }: Props) =>
      useSeededFilter({
        controls: {
          activeFilterIds: active ? ['status'] : [],
          addFilter,
          setValue,
          values: { status: value },
        },
        filterId: 'status',
        onSeedDropped,
        seed,
      }),
    { initialProps: initial },
  );
}

beforeEach(() => {
  addFilter.mockReset();
  setValue.mockReset();
  onSeedDropped.mockReset();
});

describe('useSeededFilter', () => {
  it('does nothing while the filter holds the seed the list opened with', () => {
    const { rerender } = mount({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });
    rerender({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });

    expect(addFilter).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(onSeedDropped).not.toHaveBeenCalled();
  });

  it('has the address forget the seed once the person clears the chip', () => {
    const { rerender } = mount({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });

    rerender({ active: false, seed: 'COMPLETED', value: '' });

    expect(onSeedDropped).toHaveBeenCalledTimes(1);
  });

  it('has the address forget the seed once the person picks another status', () => {
    const { rerender } = mount({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });

    rerender({ active: true, seed: 'COMPLETED', value: 'COMPLETED\u001FOPEN' });

    expect(onSeedDropped).toHaveBeenCalledTimes(1);
  });

  it('sets the filter when a link to the page is followed with another seed', () => {
    const { rerender } = mount({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });

    rerender({ active: true, seed: 'OPEN', value: 'COMPLETED' });

    expect(addFilter).toHaveBeenCalledWith('status');
    expect(setValue).toHaveBeenCalledWith('status', 'OPEN');
    expect(onSeedDropped).not.toHaveBeenCalled();
  });

  it('sets the filter when a link names a status and the person had none', () => {
    const { rerender } = mount({});

    rerender({ seed: 'EXPIRED' });

    expect(setValue).toHaveBeenCalledWith('status', 'EXPIRED');
    expect(onSeedDropped).not.toHaveBeenCalled();
  });

  it('does not take the address dropping the seed for a change of the filter, nor the reverse', () => {
    const { rerender } = mount({ active: true, seed: 'COMPLETED', value: 'COMPLETED' });

    rerender({ active: false, seed: 'COMPLETED', value: '' });
    rerender({ active: false, seed: undefined, value: '' });

    expect(onSeedDropped).toHaveBeenCalledTimes(1);
    expect(setValue).not.toHaveBeenCalled();
  });

  it('leaves a filter alone that was never seeded', () => {
    const { rerender } = mount({});

    rerender({ active: true, value: 'OPEN' });
    rerender({ active: false, value: '' });

    expect(onSeedDropped).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });
});
