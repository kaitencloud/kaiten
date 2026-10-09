import { describe, expect, it, vi } from 'vite-plus/test';
import type { AddonHolder } from '../../types';
import { findBlockingHolder, needsHoldersCheck } from '../addon-quantity.utils';

const holder = (instanceSlug: string, quantity: number): AddonHolder => ({
  instanceName: instanceSlug,
  instanceSlug,
  quantity,
});

describe('lowering the most an instance can hold', () => {
  it('needs a look at who holds the version when the new bound is lower than the old one', () => {
    expect(needsHoldersCheck(10, 5)).toBe(true);
  });

  it('needs it for the first bound a version gets: from unbounded, any bound is lower', () => {
    expect(needsHoldersCheck(undefined, 500)).toBe(true);
  });

  it('does not need it to keep the bound, raise it, or remove it', () => {
    expect(needsHoldersCheck(10, 10)).toBe(false);
    expect(needsHoldersCheck(10, 20)).toBe(false);
    // An empty field is NaN: no bound at all.
    expect(needsHoldersCheck(10, Number.NaN)).toBe(false);
    expect(needsHoldersCheck(undefined, Number.NaN)).toBe(false);
  });
});

describe('the instance that blocks a lower bound', () => {
  it('is the one that holds the most, when that is more than the new bound allows', async () => {
    const readHolders = vi.fn(async () => [holder('acme', 8), holder('globex', 3)]);

    expect(await findBlockingHolder({ maxQuantity: 10 }, 5, readHolders)).toEqual(holder('acme', 8));
    expect(readHolders).toHaveBeenCalledOnce();
  });

  it('is none when the most held fits the new bound, which may be reached', async () => {
    expect(
      await findBlockingHolder({ maxQuantity: 10 }, 8, async () => [holder('acme', 8)]),
    ).toBeUndefined();
  });

  it('is none when nobody holds the version', async () => {
    expect(await findBlockingHolder({ maxQuantity: 10 }, 5, async () => [])).toBeUndefined();
  });

  it('does not look at all when the change cannot leave anybody over it', async () => {
    const readHolders = vi.fn(async () => [holder('acme', 8)]);

    expect(await findBlockingHolder({ maxQuantity: 10 }, 20, readHolders)).toBeUndefined();
    expect(await findBlockingHolder({ maxQuantity: 10 }, Number.NaN, readHolders)).toBeUndefined();
    expect(readHolders).not.toHaveBeenCalled();
  });

  it('leaves the failure of the look to the caller: the change is not made when it cannot be checked', async () => {
    await expect(
      findBlockingHolder({ maxQuantity: 10 }, 5, async () => {
        throw new Error('the instances could not be read');
      }),
    ).rejects.toThrow('the instances could not be read');
  });
});
