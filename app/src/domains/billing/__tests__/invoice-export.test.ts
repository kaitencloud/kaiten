import { describe, expect, it } from 'vite-plus/test';
import {
  INVOICE_EXPORT_VARIANTS,
  invoiceExportFilename,
  toInvoiceExportQuery,
} from '../logic';

describe('the query of an invoice export', () => {
  const filters = { customerSlug: 'acme', status: ['MANUAL' as const] };

  it('asks for a CSV with a row for every line', () => {
    expect(toInvoiceExportQuery('csv-lines', filters)).toEqual({
      ...filters,
      format: 'csv',
      granularity: 'line',
    });
  });

  it('asks for a CSV with a row for every invoice', () => {
    expect(toInvoiceExportQuery('csv-invoices', filters)).toEqual({
      ...filters,
      format: 'csv',
      granularity: 'invoice',
    });
  });

  it('asks for NDJSON without a granularity, which only a CSV has', () => {
    const query = toInvoiceExportQuery('ndjson', filters);

    expect(query).toEqual({ ...filters, format: 'json' });
    expect(query.granularity).toBeUndefined();
  });

  it('carries the filters of the list and nothing of its paging', () => {
    for (const variant of INVOICE_EXPORT_VARIANTS) {
      const query = toInvoiceExportQuery(variant, {
        ...filters,
        cursor: 'next',
        limit: 50,
      } as never);

      // The export walks every page itself.
      expect(Object.keys(query), variant).toEqual(
        expect.arrayContaining(['customerSlug', 'status', 'format']),
      );
    }
  });
});

describe('the name of an exported file', () => {
  const now = new Date('2027-03-04T15:30:05.000Z');

  it('says what the file holds and the UTC moment it was exported, so two exports never overwrite each other', () => {
    expect(invoiceExportFilename('csv-lines', now)).toBe(
      'invoices-by-line-20270304T153005Z.csv',
    );
    expect(invoiceExportFilename('csv-invoices', now)).toBe(
      'invoices-by-invoice-20270304T153005Z.csv',
    );
    expect(invoiceExportFilename('ndjson', now)).toBe(
      'invoices-20270304T153005Z.ndjson',
    );
  });

  it('pads the parts of the moment', () => {
    expect(
      invoiceExportFilename('ndjson', new Date('2027-01-02T03:04:05.000Z')),
    ).toBe('invoices-20270102T030405Z.ndjson');
  });
});
