import { getAiUsageCapabilities } from '@/api-client';

/** Read deployment readiness through the generated authenticated Core client. */
export async function readAiCapability(signal: AbortSignal): Promise<boolean> {
  const { data } = await getAiUsageCapabilities({
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-store' },
    signal,
    throwOnError: true,
  });
  // Old servers, malformed responses and non-boolean truthy values never opt in.
  return data?.enabled === true;
}
