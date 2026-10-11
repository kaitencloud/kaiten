import { describe, expect, it } from 'vite-plus/test';
import { NULL_LINE_MEMBERS } from '../../../../e2e/app/_support/fixtures/build-invoice';
import {
  getInvoiceLinePriceId,
  getInvoiceLineSource,
  isAddonInvoiceLine,
} from '../logic';

// A line bills a price of a licence or a price of an add-on, and the line does not
// say which by its type: the usage and the overage an add-on rated are lines of the
// type of a licence's. The members that name the price say it.

describe('whose price an invoice line bills', () => {
  it('reads the base fee and the metered lines of a licence from the licence price', () => {
    const line = { ...NULL_LINE_MEMBERS, licensePriceId: 'price-base' };

    expect(getInvoiceLineSource(line)).toEqual({
      kind: 'LICENSE',
      priceId: 'price-base',
    });
    expect(getInvoiceLinePriceId(line)).toBe('price-base');
    expect(isAddonInvoiceLine(line)).toBe(false);
  });

  it('reads the fee of an add-on from the add-on price, with the attachment it bills', () => {
    const line = {
      ...NULL_LINE_MEMBERS,
      addonId: 'addon-seats',
      addonPriceId: 'addon-price-seats',
      instanceAddonId: 'attachment-1',
    };

    expect(getInvoiceLineSource(line)).toEqual({
      addonId: 'addon-seats',
      addonPriceId: 'addon-price-seats',
      instanceAddonId: 'attachment-1',
      kind: 'ADDON',
    });
    expect(getInvoiceLinePriceId(line)).toBe('addon-price-seats');
    expect(isAddonInvoiceLine(line)).toBe(true);
  });

  it('reads the usage of an add-on, which has no licence price, from the add-on price', () => {
    // Every metered line used to carry a `licensePriceId`: one that has none is not a
    // line with no price.
    const line = {
      ...NULL_LINE_MEMBERS,
      addonPriceId: 'addon-price-tokens',
      instanceAddonId: 'attachment-2',
      licensePriceId: null,
    };

    expect(getInvoiceLineSource(line)).toMatchObject({ kind: 'ADDON' });
    expect(getInvoiceLinePriceId(line)).toBe('addon-price-tokens');
  });

  it('knows an add-on line by its attachment alone, and a discount as billing no price', () => {
    expect(
      getInvoiceLineSource({ ...NULL_LINE_MEMBERS, instanceAddonId: 'a' }),
    ).toMatchObject({ addonPriceId: null, kind: 'ADDON' });
    expect(getInvoiceLineSource(NULL_LINE_MEMBERS)).toEqual({ kind: 'NONE' });
    expect(getInvoiceLinePriceId(NULL_LINE_MEMBERS)).toBeNull();
  });

  it('copes with a line that leaves the price members out altogether', () => {
    // The schema of a line is open: the members may be missing and not null.
    expect(getInvoiceLineSource({})).toEqual({ kind: 'NONE' });
    expect(getInvoiceLinePriceId({ licensePriceId: 'p' })).toBe('p');
  });
});
