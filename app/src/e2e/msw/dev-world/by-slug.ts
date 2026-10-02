/** The record of `items` with this slug: the world refers to itself by slug. */
export const bySlug = <T extends { slug?: string }>(
  items: T[],
  slug: string,
): T => {
  const item = items.find((candidate) => candidate.slug === slug);
  if (!item) {
    throw new Error(`The dev world has no record "${slug}"`);
  }
  return item;
};
