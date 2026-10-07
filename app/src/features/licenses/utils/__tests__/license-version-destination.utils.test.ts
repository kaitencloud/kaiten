import { describe, expect, it } from 'vite-plus/test';
import { PriceCopyError } from '../license-price-copy.utils';
import { getCreatedVersionDestination } from '../license-version-destination.utils';

const created = { slug: 'pro-v5' };

describe('where a new version opens', () => {
  it('has no page of its own to go to when it has no prices and nothing failed', () => {
    expect(
      getCreatedVersionDestination({
        baseSlug: 'pro-v2',
        hasPrices: false,
        license: created,
      }),
    ).toBeUndefined();
  });

  it('opens on its prices when it was given some, which are what there is to review', () => {
    expect(
      getCreatedVersionDestination({
        baseSlug: 'pro-v2',
        hasPrices: true,
        license: created,
      }),
    ).toEqual({
      params: { licenseSlug: 'pro-v5' },
      to: '/licenses/$licenseSlug/prices',
    });
  });

  it('opens on its prices, and says where the copy comes from, when the copy stopped', () => {
    expect(
      getCreatedVersionDestination({
        baseSlug: 'pro-v2',
        error: new PriceCopyError(new Error('refused')),
        hasPrices: true,
        license: created,
      }),
    ).toEqual({
      params: { licenseSlug: 'pro-v5' },
      search: { copyFrom: 'pro-v2' },
      to: '/licenses/$licenseSlug/prices',
    });
  });

  it('opens on its overview when a grant or the publication failed, which is where it is finished', () => {
    expect(
      getCreatedVersionDestination({
        baseSlug: 'pro-v2',
        error: new Error('refused'),
        hasPrices: false,
        license: created,
      }),
    ).toEqual({
      params: { licenseSlug: 'pro-v5' },
      to: '/licenses/$licenseSlug',
    });
  });

  it('goes nowhere when the API sent no slug for the version', () => {
    expect(
      getCreatedVersionDestination({
        baseSlug: 'pro-v2',
        error: new Error('refused'),
        hasPrices: true,
        license: {},
      }),
    ).toBeUndefined();
  });
});
