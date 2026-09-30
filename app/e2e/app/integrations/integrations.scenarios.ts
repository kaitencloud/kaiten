import type { ServiceAccount } from '@/api-client';
import { zServiceAccount } from '@/api-client/zod.gen';
import { parseContract } from '../_support/contracts/openapi-contract';

/**
 * A Kaiten Cloud deployment: the KbK serves the `webhooks` platform flag on for
 * every organization (`WEBHOOKS_FLAG` in `lib/feature-flags`, spelled out here
 * because that module only loads in the browser).
 */
export const WEBHOOKS_ON = { webhooks: true };

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
