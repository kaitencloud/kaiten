/**
 * Attio attribute slugs are snake_case identifiers (e.g. `workspace_id`).
 * The API has no attribute-listing endpoint, so the format check is the only
 * client-side guard against silently inoperative mappings.
 */
const ATTIO_SLUG_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function isValidAttioSlug(value: string): boolean {
  return ATTIO_SLUG_PATTERN.test(value.trim());
}
