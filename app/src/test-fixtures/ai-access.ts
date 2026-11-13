import type { QueryClient } from '@tanstack/react-query';
import { afterEach } from 'vite-plus/test';
import {
  aiAccessQueryOptions,
  AI_ACCESS_FRESHNESS_MS,
} from '@/domains/ai-credits';

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Synthetic successful checks, scoped to one dedicated AI scenario; never a default. */
export function setAiAccessInputsForTest(
  client: QueryClient,
  inputs: { capability: boolean; flag: boolean },
) {
  const target = window as Window & { Clerk?: unknown };
  if (!restore) {
    const previous = target.Clerk;
    restore = () => {
      target.Clerk = previous;
    };
  }
  target.Clerk = {
    ...(target.Clerk as object),
    user: { id: 'ai-test-user' },
    organization: { id: 'ai-test-organization' },
  };
  client.setQueryData(aiAccessQueryOptions().queryKey, {
    enabled: inputs.capability === true && inputs.flag === true,
    expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS,
  });
}
