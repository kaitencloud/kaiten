import { describe, expect, it } from 'vite-plus/test';
import { hasFallbackGap } from '../license-family-fallback-gap.utils';

const family = { id: 'family-pro', isPublic: true };

const version = (
  familyId: string,
  pricingType: 'CUSTOM' | 'FREE' | 'PAID',
  id = `${familyId}-${pricingType}`,
) => ({ familyId, id, pricingType });

describe('a public family with a paid version and no fallback', () => {
  it('is the one that is warned about', () => {
    expect(
      hasFallbackGap({
        family,
        fallbackSlug: null,
        licenses: [version('family-pro', 'PAID')],
      }),
    ).toBe(true);
  });

  it('is not one that names a fallback, which the form may say before it is saved', () => {
    const licenses = [version('family-pro', 'PAID')];

    expect(hasFallbackGap({ family, fallbackSlug: 'community', licenses })).toBe(
      false,
    );
    expect(hasFallbackGap({ family, fallbackSlug: '', licenses })).toBe(true);
    expect(hasFallbackGap({ family, fallbackSlug: undefined, licenses })).toBe(
      true,
    );
  });

  it('is not a private family', () => {
    expect(
      hasFallbackGap({
        family: { ...family, isPublic: false },
        fallbackSlug: null,
        licenses: [version('family-pro', 'PAID')],
      }),
    ).toBe(false);
  });

  it('is not a family without a paid version of its own, whatever the others sell', () => {
    expect(
      hasFallbackGap({
        family,
        fallbackSlug: null,
        licenses: [
          version('family-pro', 'FREE'),
          version('family-pro', 'CUSTOM'),
          version('family-other', 'PAID'),
        ],
      }),
    ).toBe(false);
  });

  it('counts any version of the family, a draft or a withdrawn one included', () => {
    expect(
      hasFallbackGap({
        family,
        fallbackSlug: null,
        licenses: [
          version('family-pro', 'FREE', 'one'),
          version('family-pro', 'PAID', 'two'),
        ],
      }),
    ).toBe(true);
  });
});
