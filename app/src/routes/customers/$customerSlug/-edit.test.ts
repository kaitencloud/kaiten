import { describe, expect, it } from 'vite-plus/test';
import { buildCustomerDetailEditRedirect } from './edit';

describe('buildCustomerDetailEditRedirect', () => {
  it('builds a redirect to customer detail opening the configure dialog', () => {
    const redirectOptions = buildCustomerDetailEditRedirect('acme');

    expect(redirectOptions.to).toBe('/customers/$customerSlug');
    expect(redirectOptions.params).toEqual({ customerSlug: 'acme' });
    expect(redirectOptions.replace).toBe(true);
    expect(redirectOptions.search({ tab: 'overview' })).toEqual({
      mode: 'configure',
      tab: 'overview',
    });
  });

  it('leads a customer whose slug is a static route of /customers to its page under /overview', () => {
    const redirectOptions = buildCustomerDetailEditRedirect('checkout-sessions');

    expect(redirectOptions.to).toBe('/customers/$customerSlug/overview');
    expect(redirectOptions.params).toEqual({ customerSlug: 'checkout-sessions' });
    expect(redirectOptions.search({})).toEqual({ mode: 'configure' });
  });
});
