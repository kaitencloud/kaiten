import { describe, expect, it } from 'vite-plus/test';
import type { PriceOption } from '../../types';
import { splitPriceSelection } from '../voucher-prices';

const option = (id: string, ownerKind: PriceOption['ownerKind']): PriceOption => ({
  amount: '$10.00/month',
  deprecated: false,
  id,
  label: id,
  owner: 'Owner',
  ownerKind,
});

const OPTIONS = [
  option('l1', 'LICENSE'),
  option('l2', 'LICENSE'),
  option('a1', 'ADDON'),
];

describe('the chosen prices, split between a license and an add-on', () => {
  it('puts each price in the list of the version it is of, in the order they were checked', () => {
    expect(
      splitPriceSelection(['a1', 'l2', 'l1'], OPTIONS, { addon: [], license: [] }),
    ).toEqual({ addon: ['a1'], license: ['l2', 'l1'] });
  });

  it('keeps a price the console no longer lists in the list it was in: it is a limit the voucher carries', () => {
    expect(
      splitPriceSelection(['gone-l', 'gone-a', 'l1'], OPTIONS, {
        addon: ['gone-a'],
        license: ['gone-l'],
      }),
    ).toEqual({ addon: ['gone-a'], license: ['gone-l', 'l1'] });
  });

  it('drops what was unchecked, and a price nobody knows the owner of that nothing held', () => {
    expect(
      splitPriceSelection(['l1', 'mystery'], OPTIONS, { addon: ['a1'], license: ['l1'] }),
    ).toEqual({ addon: [], license: ['l1'] });
  });

  it('is empty when nothing is checked', () => {
    expect(splitPriceSelection([], OPTIONS, { addon: ['a1'], license: ['l1'] })).toEqual({
      addon: [],
      license: [],
    });
  });
});
