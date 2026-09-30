import type { DeploymentZone } from '@/api-client';
import { TEST_USER } from './build-customer';

/**
 * Build a DeploymentZone fixture for use in scenario factories.
 * `id`, `name`, `slug`, `type` and `description` are required.
 */
export function buildDeploymentZone({
  createdAt = '2026-03-01T09:00:00.000Z',
  description,
  id,
  metadata = {},
  name,
  releaseId,
  slug,
  type,
  updatedAt = createdAt,
}: {
  createdAt?: string;
  description: string;
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  releaseId?: string;
  slug: string;
  type: string;
  updatedAt?: string;
}): DeploymentZone {
  return {
    createdAt,
    createdBy: TEST_USER,
    description,
    id,
    metadata,
    name,
    releaseId,
    slug,
    type,
    updatedAt,
    updatedBy: TEST_USER,
  };
}
