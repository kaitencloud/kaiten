import { client } from '@/api-client/client.gen';
import type { DemoResetResult, DemoSeedResult, DemoStatus } from './types';

// These three paths are not served by kaiten's own api process: a hosted layer
// in front of it renders them onto the same gateway listener, and kaiten's own
// chart does not name them. Which service answers is deliberately invisible
// here -- the app addresses one origin, `/api`, and uses the shared client, so
// base URL, bearer token and ApiError wrapping come from @/lib/api like every
// other feature.

export async function getDemoStatus(signal?: AbortSignal) {
  const response = await client.get<{ 200: DemoStatus }, unknown, true>({
    url: '/demo/status',
    signal,
    throwOnError: true,
  });

  return response.data;
}

// Seed and reset both answer 202: the run is started, not finished, and
// use-demo-status polls for the completion.
export async function seedDemoData() {
  const response = await client.post<{ 202: DemoSeedResult }, unknown, true>({
    url: '/demo/seed',
    throwOnError: true,
  });

  return response.data;
}

export async function resetDemoData() {
  const response = await client.post<{ 202: DemoResetResult }, unknown, true>({
    url: '/demo/reset',
    throwOnError: true,
  });

  return response.data;
}
