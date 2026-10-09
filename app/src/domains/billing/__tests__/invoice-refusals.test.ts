import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { isPaidAtProviderRefusal, readRecomposeRefusal } from '../logic';

const refusal = (code: string, errors?: unknown[]) =>
  new ApiError({
    data: { code, detail: 'refused', errors, status: 409 },
    status: 409,
  });

describe('why a recompose was refused', () => {
  it('says an invoice that is neither a held draft nor void has to be voided first', () => {
    expect(
      readRecomposeRefusal(refusal('RecomposeInvoice.InvalidStatus')),
    ).toEqual({ kind: 'needs-void' });
  });

  it('says the instance was deleted', () => {
    expect(
      readRecomposeRefusal(refusal('RecomposeInvoice.InstanceDeleted')),
    ).toEqual({ kind: 'instance-deleted' });
  });

  it('names the replacement a void invoice already has', () => {
    expect(
      readRecomposeRefusal(
        refusal('RecomposeInvoice.AlreadyReplaced', [
          { value: { replacementInvoiceId: 'inv-2' } },
        ]),
      ),
    ).toEqual({ kind: 'already-replaced', replacementInvoiceId: 'inv-2' });
  });

  it('is nothing for a refusal because the boundary has a live invoice, which names none', () => {
    expect(
      readRecomposeRefusal(refusal('RecomposeInvoice.AlreadyReplaced')),
    ).toBeUndefined();
    expect(
      readRecomposeRefusal(
        refusal('RecomposeInvoice.AlreadyReplaced', [{ value: 'inv-2' }]),
      ),
    ).toBeUndefined();
    expect(
      readRecomposeRefusal(
        refusal('RecomposeInvoice.AlreadyReplaced', [
          { value: { replacementInvoiceId: 7 } },
        ]),
      ),
    ).toBeUndefined();
  });

  it('is nothing for any other failure: a bare problem, another code, a network failure', () => {
    expect(readRecomposeRefusal(refusal('RecomposeInvoice.NotFound'))).toBeUndefined();
    expect(
      readRecomposeRefusal({ code: 'RecomposeInvoice.InvalidStatus', detail: 'x' }),
    ).toEqual({ kind: 'needs-void' });
    expect(readRecomposeRefusal(new Error('Failed to fetch'))).toBeUndefined();
    expect(readRecomposeRefusal(undefined)).toBeUndefined();
  });
});

describe('a void refused because the invoice is paid at the provider', () => {
  const voidRefusal = (code: string, errors?: unknown[]) => refusal(code, errors);

  it('is read from the value the API gives the refusal', () => {
    expect(
      isPaidAtProviderRefusal(
        voidRefusal('VoidInvoice.InvalidStatus', [
          { location: 'provider', message: 'paid at the provider', value: 'paid_at_provider' },
        ]),
      ),
    ).toBe(true);
  });

  it('is not any other refusal of a void', () => {
    expect(
      isPaidAtProviderRefusal(voidRefusal('VoidInvoice.InvalidStatus')),
    ).toBe(false);
    expect(
      isPaidAtProviderRefusal(
        voidRefusal('VoidInvoice.InvalidStatus', [{ value: 'something_else' }]),
      ),
    ).toBe(false);
    expect(
      isPaidAtProviderRefusal(
        voidRefusal('VoidInvoice.ProviderUnavailable', [
          { value: 'paid_at_provider' },
        ]),
      ),
    ).toBe(false);
    expect(isPaidAtProviderRefusal(new Error('offline'))).toBe(false);
  });
});
