import type { ServiceAccount } from '@/api-client';
import { zServiceAccount } from '@/api-client/zod.gen';
import { parseContract } from '../_support/contracts/openapi-contract';

/** The service account a token is created for, with no token yet. */
export function createSdkServiceAccount(): ServiceAccount {
  return parseContract(
    zServiceAccount,
    {
      id: 'service-account-1',
      name: 'SDK runtime',
      slug: 'sdk-runtime',
      createdAt: '2026-09-01T09:00:00Z',
      tokens: [],
    },
    'createSdkServiceAccount',
  );
}
