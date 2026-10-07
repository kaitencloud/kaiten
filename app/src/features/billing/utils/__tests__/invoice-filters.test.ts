import { describe, expect, it } from 'vite-plus/test';
import { invoiceFiltersSchema, readInvoiceFilters } from '../../schemas/invoice-filters.schema';
import {
  countActiveInvoiceFilters,
  hasActiveInvoiceFilters,
  invoiceFiltersToQuery,
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
