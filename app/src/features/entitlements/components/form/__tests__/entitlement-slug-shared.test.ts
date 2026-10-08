import { describe, expect, it } from 'vite-plus/test';
import {
  entitlementSlugSchema,
  getEntitlementSlugPreview,
  toOptionalSlug,
} from '../entitlement-slug.shared';

describe('entitlementSlugSchema', () => {
  it.each([
    { slug: '', reason: 'a blank slug' },
    { slug: 'api-calls', reason: 'words joined by a hyphen' },
    { slug: 'ab', reason: 'the shortest slug' },
    { slug: 'v2', reason: 'a digit' },
    { slug: 'a1-b2-c3', reason: 'digits among the hyphens' },
    { slug: 'a'.repeat(100), reason: 'the longest slug' },
  ])('accepts $reason', ({ slug }) => {
    expect(entitlementSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    { slug: 'a', reason: 'a single character' },
    { slug: '-api-calls', reason: 'a leading hyphen' },
    { slug: 'api-calls-', reason: 'a trailing hyphen' },
    { slug: 'Api-Calls', reason: 'uppercase letters' },
    { slug: 'api calls', reason: 'a space' },
    { slug: ' api-calls', reason: 'a leading space' },
    { slug: 'api_calls', reason: 'an underscore' },
    { slug: 'café', reason: 'an accent' },
    { slug: 'a'.repeat(101), reason: 'more than 100 characters' },
  ])('rejects $reason', ({ slug }) => {
    expect(entitlementSlugSchema.safeParse(slug).success).toBe(false);
  });

  it('reports a translation key for the form to display', () => {
    const result = entitlementSlugSchema.safeParse('Api Calls');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'Pages.Entitlements.Mutation.Form.Errors.slug',
    );
  });
});

describe('toOptionalSlug', () => {
  it('leaves a blank slug out so the API generates one', () => {
    expect(toOptionalSlug('')).toBeUndefined();
    expect(toOptionalSlug('   ')).toBeUndefined();
    expect(toOptionalSlug(undefined)).toBeUndefined();
  });

  it('keeps the slug typed in the form', () => {
    expect(toOptionalSlug('reads-v2')).toBe('reads-v2');
  });

  it('trims the slug', () => {
    expect(toOptionalSlug('  reads-v2 ')).toBe('reads-v2');
  });
});

describe('getEntitlementSlugPreview', () => {
  const fallback = 'api-calls';

  it('previews the slug the API builds from the name', () => {
    expect(getEntitlementSlugPreview('Storage Reads', fallback)).toEqual({
      placeholder: 'storage-reads',
      example: 'storage-reads-3fa9c1',
    });
  });

  it('drops accents and apostrophes, and joins the rest with hyphens', () => {
    expect(getEntitlementSlugPreview("Café d'Été (beta)", fallback)).toEqual({
      placeholder: 'cafe-dete-beta',
      example: 'cafe-dete-beta-3fa9c1',
    });
  });

  it('shows the generic example while no name is typed', () => {
    const generic = { placeholder: 'api-calls', example: 'api-calls-3fa9c1' };

    expect(getEntitlementSlugPreview('', fallback)).toEqual(generic);
    expect(getEntitlementSlugPreview('   ', fallback)).toEqual(generic);
  });

  // The API closes a name that gives nothing with its random suffix alone.
  it('shows the suffix alone for a name with nothing to keep', () => {
    expect(getEntitlementSlugPreview('株式会社', fallback)).toEqual({
      placeholder: 'api-calls',
      example: '3fa9c1',
    });
  });
});
