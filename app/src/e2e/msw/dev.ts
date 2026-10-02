import { startE2EMockServiceWorker } from './browser';
import { createDevMockConfig } from './dev-world';

/**
 * The console without a backend (`pnpm run dev:mock`, VITE_MOCK_API=true): the
 * API answered by Mock Service Worker in the page, every area seeded from one
 * world (./dev-world). A request no area serves prints an `[MSW]` warning that
 * names it. What a page changes lives in `sessionStorage`, so it survives a
 * reload and a new tab starts over.
 */
export async function startDevMocks() {
  await startE2EMockServiceWorker(createDevMockConfig(), {
    warnUnhandledApiRequests: true,
  });
}
