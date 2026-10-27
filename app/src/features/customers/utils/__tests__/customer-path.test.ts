import { describe, expect, it } from 'vite-plus/test';
import {
  getCustomerDetailPath,
  getCustomerDetailTarget,
  isShadowedCustomerSlug,
  SHADOWED_CUSTOMER_SLUGS,
} from '../customer-path';

describe('the slugs a static route of /customers shadows', () => {
  it('are the three paths below /customers that are no customer', () => {
    expect([...SHADOWED_CUSTOMER_SLUGS].sort()).toEqual([
      'checkout-sessions',
      'instances',
      'new',
    ]);
    expect(isShadowedCustomerSlug('checkout-sessions')).toBe(true);
    expect(isShadowedCustomerSlug('acme-corp')).toBe(false);
    expect(isShadowedCustomerSlug('checkout-sessions-ltd')).toBe(false);
  });
});

describe('getCustomerDetailTarget', () => {
  it('leads to /customers/<slug> for a customer like any other', () => {
    expect(getCustomerDetailTarget('acme-corp')).toEqual({
      params: { customerSlug: 'acme-corp' },
      to: '/customers/$customerSlug',
    });
  });

  it.each(['checkout-sessions', 'new'])(
    'leads to the page of %s under /overview, which its own address is not',
    (slug) => {
      expect(getCustomerDetailTarget(slug)).toEqual({
        params: { customerSlug: slug },
        to: '/customers/$customerSlug/overview',
      });
    },
  );

  it('has no address under /overview for instances, whose static route takes a segment of its own', () => {
    expect(getCustomerDetailTarget('instances').to).toBe(
      '/customers/$customerSlug',
    );
  });
});

describe('getCustomerDetailPath', () => {
  it('is the address getCustomerDetailTarget leads to, written out', () => {
    expect(getCustomerDetailPath('acme-corp')).toBe('/customers/acme-corp');
    expect(getCustomerDetailPath('checkout-sessions')).toBe(
      '/customers/checkout-sessions/overview',
    );
    expect(getCustomerDetailPath('new')).toBe('/customers/new/overview');
    expect(getCustomerDetailPath('instances')).toBe('/customers/instances');
  });

  it('writes a slug as it goes in an address', () => {
    expect(getCustomerDetailPath('acme corp/eu')).toBe(
      '/customers/acme%20corp%2Feu',
    );
  });
});
