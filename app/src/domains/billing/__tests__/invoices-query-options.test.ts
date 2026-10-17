import { describe, expect, it } from 'vite-plus/test';
import { listInvoicesOptions } from '@/api-client/@tanstack/react-query.gen';
import { invoicesQueryOptions } from '../queries';

describe('the invoices of the organization', () => {
  it('keep the key the generated options give the list, with the filters in it', () => {
    expect(invoicesQueryOptions({ customerSlug: 'acme' }).queryKey).toEqual(
      listInvoicesOptions({ query: { customerSlug: 'acme' } }).queryKey,
    );
  });

  it('are not retried, and a refusal the loader met is not read again when the page mounts', () => {
    const options = invoicesQueryOptions();

    expect(options.retry).toBe(false);
    expect(options.retryOnMount).toBe(false);
  });
});
