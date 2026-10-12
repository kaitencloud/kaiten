import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { getCustomerReturnUrl, leaveToProvider } from '../provider-pages';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('where a customer comes back to from a page Stripe hosts', () => {
  it('is its own page in the console, on the address the console is served from', () => {
    expect(getCustomerReturnUrl('acme')).toBe(
      `${window.location.origin}/customers/acme`,
    );
  });

  it('writes a slug as it goes in an address', () => {
    expect(getCustomerReturnUrl('acme corp/eu')).toBe(
      `${window.location.origin}/customers/acme%20corp%2Feu`,
    );
  });
});

describe('leaving for a page Stripe hosts', () => {
  it('sends the whole page there, since the page comes back to the console', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });

    leaveToProvider('https://checkout.stripe.test/c/setup/cs_1');

    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/c/setup/cs_1');
  });
});
