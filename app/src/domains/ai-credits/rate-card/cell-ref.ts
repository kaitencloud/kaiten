/**
 * The cell of the rate card a link opens, as the URL carries it (`?cell=`):
 * `<licenceSlug>~<modelSlug>`, or `<licenceSlug>~*` for the wildcard row of a
 * version. Shared by the rate card and by the screens that link to a cell.
 *
 * The wildcard is `*` because no slug can be: a slug is lowercase letters,
 * digits and hyphens, so a word (`any`) could be a model's own slug, and that
 * model's cell would open the wildcard row.
 */
export const WILDCARD_CELL_MODEL = '*';

/** `<licenceSlug>~<modelSlug>`; a null model is the wildcard row. */
export function rateCardCellOf(
  licenseSlug: string,
  modelSlug: string | null,
): string {
  return `${licenseSlug}~${modelSlug ?? WILDCARD_CELL_MODEL}`;
}
