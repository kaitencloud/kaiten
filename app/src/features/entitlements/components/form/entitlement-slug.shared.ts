import { z } from 'zod';
import { zEntitlementWritable } from '@/api-client/zod.gen';
import { generateSlug } from '@/functionals/slug';

// The generated schema owns the slug rule (2 to 100 characters: a-z, 0-9 and
// inner hyphens); the refinement only attaches a translated message to it. A
// blank slug is valid: the API then generates one from the name.
export const entitlementSlugSchema = z
  .string()
  .refine(
    (slug) =>
      slug === '' || zEntitlementWritable.shape.slug.safeParse(slug).success,
    { message: 'Pages.Entitlements.Mutation.Form.Errors.slug' },
  );

/**
 * The form keeps an empty string for a slug left blank; the request leaves it
 * out, which is how the API is asked to generate one.
 */
export const toOptionalSlug = (slug?: string): string | undefined => {
  const trimmed = slug?.trim();
  return trimmed ? trimmed : undefined;
};

// The API closes the slug it generates with 6 random hexadecimal characters
// (slugutil.GenerateUnique). The preview shows that shape with a fixed example.
const EXAMPLE_SUFFIX = '3fa9c1';

const joinSlug = (base: string, suffix: string) =>
  base ? `${base}-${suffix}` : suffix;

export type EntitlementSlugPreview = {
  /** What the name gives on its own: the part the API keeps from it. */
  placeholder: string;
  /** A slug shaped like the one the API generates, with an example suffix. */
  example: string;
};

/**
 * Previews the slug the API generates from a name: the name without accents,
 * lowercased, with every run of other characters turned into one hyphen
 * (`generateSlug` follows the same rules), then `-` and 6 random characters.
 * A name that leaves nothing, such as an empty one or one with no Latin
 * letters, falls back to `fallback` for the placeholder; the example then
 * follows what the API would do: the suffix alone for a name that gives
 * nothing, `fallback` for a name not typed yet.
 */
export const getEntitlementSlugPreview = (
  name: string,
  fallback: string,
): EntitlementSlugPreview => {
  const base = generateSlug(name);
  const typedName = name.trim() !== '';

  return {
    placeholder: base || fallback,
    example: joinSlug(typedName ? base : fallback, EXAMPLE_SUFFIX),
  };
};
