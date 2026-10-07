import { describe, expect, it } from 'vite-plus/test';
import { invoiceFiltersSchema, readInvoiceFilters } from '../../schemas/invoice-filters.schema';
import {
  countActiveInvoiceFilters,
  dateInputToInstant,
  hasActiveInvoiceFilters,
  instantToDateInput,
  invoiceFiltersToQuery,
  isPeriodInvalid,
} from '../invoice-filters';

describe('reading the filters of the list from the URL', () => {
  it('reads a status given once as a list of one, and a list as it is', () => {
    expect(readInvoiceFilters({ status: 'PAID' }).status).toEqual(['PAID']);
    expect(readInvoiceFilters({ status: ['PAID', 'MANUAL'] }).status).toEqual([
      'PAID',
      'MANUAL',
    ]);
  });

  it('drops a value that is no filter and keeps the rest, instead of failing the page', () => {
    expect(
      readInvoiceFilters({
        kind: 'NOT_A_KIND',
        providerKind: 'STRIPE',
        status: ['PAID', 'NOT_A_STATUS'],
      }),
    ).toEqual({ providerKind: 'STRIPE' });
  });

  it('keeps the filters that are set and none that are not', () => {
    const filters = readInvoiceFilters({
      customerSlug: ' initech ',
      handoffStatus: 'PENDING',
      held: true,
      instanceSlug: '',
      kind: 'RENEWAL',
      overdue: true,
    });

    expect(filters).toEqual({
      customerSlug: 'initech',
      handoffStatus: 'PENDING',
      held: true,
      kind: 'RENEWAL',
      overdue: true,
    });
    // An emptied slug is no filter: it is not counted, and it is not sent.
    expect(countActiveInvoiceFilters(filters)).toBe(5);
    expect(invoiceFiltersToQuery(filters)).not.toHaveProperty('instanceSlug');
  });

  it('reads a "no" for a yes-only filter as no filter at all', () => {
    expect(readInvoiceFilters({ held: false, overdue: false })).toEqual({});
  });

  it('reads the dates of the periods as the API takes them', () => {
    expect(
      readInvoiceFilters({
        boundaryFrom: '2027-03-01T00:00:00.000Z',
        boundaryTo: '2027-04-01T00:00:00.000Z',
      }),
    ).toEqual({
      boundaryFrom: '2027-03-01T00:00:00.000Z',
      boundaryTo: '2027-04-01T00:00:00.000Z',
    });
    expect(readInvoiceFilters({ boundaryFrom: 'yesterday' })).toEqual({});
  });

  it('opens the bare list for a URL with no filters', () => {
    expect(readInvoiceFilters({})).toEqual({});
    expect(invoiceFiltersSchema.parse({ unknown: 'x' })).toEqual({});
  });
});

describe('the filters as the query of the API', () => {
  it('carries the filters that are set, under the names the API gives them', () => {
    expect(
      invoiceFiltersToQuery({
        customerSlug: 'initech',
        kind: 'RENEWAL',
        status: ['MANUAL'],
      }),
    ).toEqual({ customerSlug: 'initech', kind: 'RENEWAL', status: ['MANUAL'] });
  });

  it('carries nothing for no filter', () => {
    expect(invoiceFiltersToQuery({})).toEqual({});
  });

  it('counts the filters that are set', () => {
    expect(countActiveInvoiceFilters({})).toBe(0);
    expect(hasActiveInvoiceFilters({})).toBe(false);
    expect(
      countActiveInvoiceFilters({ held: true, kind: 'FINAL', status: ['PAID'] }),
    ).toBe(3);
    expect(hasActiveInvoiceFilters({ held: true })).toBe(true);
  });
});

describe('the days of a period', () => {
  it('reads a day as the start of that day in UTC', () => {
    expect(dateInputToInstant('2027-03-01')).toBe('2027-03-01T00:00:00.000Z');
  });

  it.each(['', 'soon', '2027-13-45', '03/01/2027'])(
    'reads %j as no date',
    (value) => {
      expect(dateInputToInstant(value)).toBeUndefined();
    },
  );

  it('writes an instant as the UTC day a date input holds', () => {
    expect(instantToDateInput('2027-03-01T23:59:59.000Z')).toBe('2027-03-01');
    expect(instantToDateInput(undefined)).toBe('');
    expect(instantToDateInput('not a date')).toBe('');
  });

  it('refuses a period that ends before it starts, or on the instant it starts', () => {
    expect(
      isPeriodInvalid('2027-03-02T00:00:00.000Z', '2027-03-01T00:00:00.000Z'),
    ).toBe(true);
    expect(
      isPeriodInvalid('2027-03-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z'),
    ).toBe(true);
    expect(
      isPeriodInvalid('2027-03-01T00:00:00.000Z', '2027-03-02T00:00:00.000Z'),
    ).toBe(false);
  });

  it('accepts a period open at either end', () => {
    expect(isPeriodInvalid('2027-03-01T00:00:00.000Z', undefined)).toBe(false);
    expect(isPeriodInvalid(undefined, '2027-03-01T00:00:00.000Z')).toBe(false);
    expect(isPeriodInvalid(undefined, undefined)).toBe(false);
  });
});
