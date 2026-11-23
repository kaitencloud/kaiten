import { client } from '@/api-client/client.gen';
import type { BetaFeatureState } from './types';

/**
 * Turns a beta on or off for the caller's own organization: saas-api's
 * `PUT /beta-features/{flagSlug}`, which writes the choice where the platform
 * flags read it. Written by hand because `app/openapi.yaml` does not describe
 * it: only Kaiten Cloud's saas-api serves it, behind the `beta-features` flag.
 */
export async function setBetaFeature(
  flagSlug: string,
  enabled: boolean,
): Promise<BetaFeatureState> {
  const response = await client.put<{ 200: BetaFeatureState }, unknown, true>({
    url: `/beta-features/${encodeURIComponent(flagSlug)}`,
    body: { enabled },
    headers: { 'Content-Type': 'application/json' },
    throwOnError: true,
  });

  return response.data;
}
