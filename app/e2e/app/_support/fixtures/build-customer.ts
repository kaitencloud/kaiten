import type { Customer } from '@/api-client';

export const TEST_USER = {
  id: 'user-e2e',
  name: 'E2E Tester',
} as const;

/**
 * Build a minimal Customer fixture for use in scenario factories.
 * Only `id`, `name`, and `slug` are required — all other fields have sensible defaults.
 */
export function buildCustomer({
  createdAt = '2026-03-01T09:00:00.000Z',
  domain,
  externalCustomerId = null,
  id,
  name,
  slug,
  updatedAt = createdAt,
}: {
  createdAt?: string;
  domain?: string;
  externalCustomerId?: string | null;
  id: string;
  name: string;
  slug: string;
  updatedAt?: string;
}): Customer {
  return {
    createdAt,
    createdBy: TEST_USER,
    domain,
    externalCustomerId,
    id,
    name,
    slug,
    updatedAt,
    updatedBy: TEST_USER,
  };
}
