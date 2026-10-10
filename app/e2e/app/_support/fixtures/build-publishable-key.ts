import type { PublishableKey } from '@/api-client';

const CREATED_AT = '2026-03-01T09:00:00.000Z';

/**
 * Build a publishable key as the API lists it: never the key itself, only its last four
 * characters. A key is live and may be used from no browser origin unless it says
 * otherwise.
 */
export function buildPublishableKey({
  allowedOrigins = [],
  createdAt = CREATED_AT,
  id,
  keyHint = 'k001',
  label,
  lastUsedAt,
  revokedAt,
  updatedAt,
}: {
  allowedOrigins?: string[];
  createdAt?: string;
  id: string;
  keyHint?: string;
  label: string;
  lastUsedAt?: string;
  revokedAt?: string;
  updatedAt?: string;
}): PublishableKey {
  return {
    allowedOrigins,
    createdAt,
    id,
    keyHint,
    label,
    ...(lastUsedAt ? { lastUsedAt } : {}),
    ...(revokedAt ? { revokedAt } : {}),
    updatedAt: updatedAt ?? revokedAt ?? createdAt,
  };
}
