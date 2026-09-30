import type { License } from '@/api-client';

/**
 * Build a License fixture for use in instance scenario factories.
 * `id`, `name`, `slug`, `type`, and `description` are required.
 */
export function buildLicense({
  createdAt = '2026-03-01T09:00:00.000Z',
  description,
  familyId,
  id,
  isDefault = false,
  lifecycleState,
  name,
  slug,
  type,
  updatedAt = createdAt,
  version = '1',
  versionName,
}: {
  createdAt?: string;
  description: string;
  familyId?: string;
  id: string;
  isDefault?: boolean;
  lifecycleState?: License['lifecycleState'];
  name: string;
  slug: string;
  type: License['type'];
  updatedAt?: string;
  version?: string;
  versionName?: string;
}): License {
  return {
    createdAt,
    description,
    // Defaults to a family of this license's own, which is what a
    // single-version fixture is. Scenarios that need two versions of one
    // product pass the same familyId to both.
    familyId: familyId ?? `family-${id}`,
    id,
    isDefault,
    lifecycleState,
    name,
    slug,
    type,
    updatedAt,
    version,
    versionName,
  };
}
