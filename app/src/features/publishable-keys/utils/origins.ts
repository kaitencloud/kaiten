/**
 * The origins a publishable key may be sent from, as the API reads them
 * (`api/internal/modules/publicsdk/keys`): `scheme://host[:port]`, https, or http for
 * localhost, in the form a browser sends in its `Origin` header. The API compares an
 * origin to the one a request carries, so a path, a query, a fragment or a user makes
 * it no origin at all.
 *
 * The API drops a lone trailing slash and keeps the origin; the console refuses it
 * instead, since an origin has none and a pasted address that ends in one is what a
 * person gets wrong. Everything the console accepts, the API accepts.
 */

/** The most origins a key can hold; the contract's `maxItems`, which a unit test holds it to. */
export const MAX_ORIGINS = 50;

const ORIGIN = /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;

// The hosts http is allowed for: a page being built on this machine.
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** The origin a text stands for, lower-cased as a browser sends it, or nothing when it is none. */
export function normalizeOrigin(text: string): string | undefined {
  const match = ORIGIN.exec(text.trim());
  if (!match) {
    return undefined;
  }
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const port = match[3] ?? '';

  if (scheme === 'http' && !LOCAL_HOSTS.includes(host)) {
    return undefined;
  }

  return `${scheme}://${host}${port}`;
}

export type ParsedOrigins = {
  /** The origins that are valid, each once, in the order they were typed. */
  origins: string[];
  /** What was typed and is no origin, as it was typed. */
  rejected: string[];
};

/**
 * The origins in the text of the field: one to a line, and a space or a comma
 * separates them as well, since neither is part of an origin and a list pasted from a
 * page of settings arrives either way.
 */
export function parseOrigins(text: string): ParsedOrigins {
  const origins: string[] = [];
  const rejected: string[] = [];

  for (const entry of text.split(/[\s,]+/).filter(Boolean)) {
    const origin = normalizeOrigin(entry);
    if (origin === undefined) {
      rejected.push(entry);
    } else if (!origins.includes(origin)) {
      origins.push(origin);
    }
  }

  return { origins, rejected };
}

/** The text of the field for origins a key already holds. */
export const originsToText = (origins: readonly string[]): string =>
  origins.join('\n');
