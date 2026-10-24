import type { PublishableKey } from '@/api-client';

const CREATED_AT = '2026-03-01T09:00:00.000Z';

// Cloudflare's published Turnstile test key, which always passes: never a real widget's.
const DEFAULT_SITE_KEY = '1x00000000000000000000AA';

/**
 * Build a publishable key as the API lists it: never the key itself, only its last four
 * characters, and never the Turnstile secret, only whether one is stored. A key is live,
 * may be used from no browser origin and opens no anonymous checkout unless it says
 * otherwise; one that does holds a Turnstile site key and secret, as the API requires,
 * unless the fixture is made to say otherwise.
 */
export function buildPublishableKey({
  allowedOrigins = [],
  anonymousCheckout = false,
  createdAt = CREATED_AT,
  id,
  keyHint = 'k001',
  label,
  lastUsedAt,
  revokedAt,
  turnstileSecretConfigured = anonymousCheckout,
  turnstileSiteKey = anonymousCheckout ? DEFAULT_SITE_KEY : null,
  updatedAt,
}: {
  allowedOrigins?: string[];
  /** Whether the key opens the anonymous checkout. */
  anonymousCheckout?: boolean;
  createdAt?: string;
  id: string;
  keyHint?: string;
  label: string;
  lastUsedAt?: string;
  revokedAt?: string;
  /** Whether a Turnstile secret is stored for the key; it is when the checkout is open. */
  turnstileSecretConfigured?: boolean;
  /** The Turnstile site key; Cloudflare's published test key when the checkout is open. */
  turnstileSiteKey?: string | null;
  updatedAt?: string;
}): PublishableKey {
  return {
    allowedOrigins,
    anonymousCheckout,
    createdAt,
    id,
    keyHint,
    label,
    lastUsedAt: lastUsedAt ?? null,
    revokedAt: revokedAt ?? null,
    turnstileSecretConfigured,
    turnstileSiteKey,
    updatedAt: updatedAt ?? revokedAt ?? createdAt,
  };
}
