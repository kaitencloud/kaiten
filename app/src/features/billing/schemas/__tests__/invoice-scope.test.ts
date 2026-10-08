import { describe, expect, it } from 'vite-plus/test';
import { readInvoiceScope } from '../invoice-scope.schema';

describe('the scope of the list of invoices, as the URL holds it', () => {
  it('is the slug of a customer, of an instance, or of both', () => {
    expect(readInvoiceScope({ customerSlug: 'acme' })).toEqual({
      customerSlug: 'acme',
      instanceSlug: undefined,
    });
    expect(readInvoiceScope({ instanceSlug: 'acme-prod' }).instanceSlug).toBe(
      'acme-prod',
    );
    expect(
      readInvoiceScope({ customerSlug: 'acme', instanceSlug: 'acme-prod' }),
    ).toEqual({ customerSlug: 'acme', instanceSlug: 'acme-prod' });
  });

  it('is none for the bare path', () => {
    expect(readInvoiceScope({})).toEqual({
      customerSlug: undefined,
      instanceSlug: undefined,
    });
  });

  it('drops what does not read as a slug, field by field, and keeps the rest', () => {
    expect(
      readInvoiceScope({ customerSlug: '   ', instanceSlug: 'acme-prod' }),
    ).toMatchObject({ customerSlug: undefined, instanceSlug: 'acme-prod' });
    expect(readInvoiceScope({ customerSlug: 42 }).customerSlug).toBeUndefined();
    expect(
      readInvoiceScope({ customerSlug: 'x'.repeat(201) }).customerSlug,
    ).toBeUndefined();
  });

  it('trims a slug, and ignores every other search parameter, the filters of the old links included', () => {
    expect(
      readInvoiceScope({ customerSlug: ' acme ', kind: 'RENEWAL', status: 'PAID' }),
    ).toEqual({ customerSlug: 'acme', instanceSlug: undefined });
  });
});
