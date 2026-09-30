import type { EvaluateFlagsBulkResponses } from '@/api-client';
import { zEvaluateFlagsBulkResponse } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';

/** Where the app's platform flags are evaluated in the e2e build. */
export const PLATFORM_FLAGS_EVALUATION_URL = '**/api/ofrep/v1/evaluate/flags';

/**
 * The bulk OFREP evaluation the app gates its own features on
 * (`lib/feature-flags`), answering each listed flag with its boolean. A flag
 * left out is absent from the answer, which the app reads as off.
 */
export function bulkFlagEvaluation(
  flags: Record<string, boolean>,
): EvaluateFlagsBulkResponses[200] {
  return parseContract(
    zEvaluateFlagsBulkResponse,
    {
      flags: Object.entries(flags).map(([key, value]) => ({
        key,
        value,
        variant: value ? 'on' : 'off',
        reason: 'TARGETING_MATCH',
      })),
    },
    'bulkFlagEvaluation',
  );
}

/**
 * No platform flag on: what a self-hosted deployment reads, since it has no
 * Kaiten-by-Kaiten to evaluate them against.
 *
 * The suite's default whenever a spec installs no evaluation, in both mock
 * modes: the `page` fixture of `app-test.ts` answers it, and so does a running
 * MSW worker. An e2e run sees the open-source console, whatever API happens to
 * listen behind the dev server, and a spec that needs a Kaiten Cloud feature
 * says so with `installFlagEvaluations`.
 */
export const NO_PLATFORM_FLAGS: Record<string, boolean> = {};
