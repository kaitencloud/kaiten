import { client } from '@/api-client/client.gen';
import type { PlanSession } from './types';

/**
 * Mints the customer session of the Plan & usage page: saas-api's
 * `POST /plan/session`, for the caller's own organization (it reads nothing from
 * the body). Written by hand because `app/openapi.yaml` does not describe it:
 * only Kaiten Cloud's saas-api serves it, behind the `plan-billing` flag.
 */
export async function createPlanSession(): Promise<PlanSession> {
  const response = await client.post<{ 201: PlanSession }, unknown, true>({
    url: '/plan/session',
    throwOnError: true,
  });

  return response.data;
}
