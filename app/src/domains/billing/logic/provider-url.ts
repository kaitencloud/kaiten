/**
 * The address of a page the payment provider hosts (the invoice a customer pays on,
 * its PDF), when it is safe to put in a link: an absolute https address. The
 * console renders what the API sent each time and keeps none of it, but a link is
 * followed, and a provider's data is not the console's to trust: an address that
 * is not https, or not an address at all (`javascript:`, a relative path, text),
 * is no link.
 */
export function getSafeProviderUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
