// The schemes a link may use. Anything else, `javascript:`, `data:`,
// `vbscript:`, `file:` or a custom scheme, never becomes an href.
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * The href a markdown link may carry, or `undefined` when it may carry none.
 *
 * Only an absolute URL with an allowed scheme passes. A relative or
 * protocol-relative URL (`/admin`, `../x`, `//host`) would resolve against the
 * console's own origin, so it is refused too, as is anything the URL parser
 * rejects. The value returned is the parser's own serialization, so the
 * browser follows exactly the URL that was checked: tabs, newlines and case
 * tricks in the scheme (`java\tscript:`, `JAVASCRIPT:`) are normalized before
 * the check, not after it.
 */
export function toSafeMarkdownHref(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }

  return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
}
