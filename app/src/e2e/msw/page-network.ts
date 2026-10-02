import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import type { RequestHandler, UnhandledFrameHandle } from 'msw';
import { defineNetwork, InterceptorSource } from 'msw/experimental';

/**
 * Mock Service Worker in the page, with no service worker: `fetch` and
 * `XMLHttpRequest` are patched, so only the requests the page's own code makes
 * are seen. An `EventSource` is not one of them.
 *
 * The stories use it (.storybook/msw.ts), and so does the browser worker when a
 * service worker cannot start (./browser.ts).
 */
export function createPageNetwork({
  handlers = [],
  onUnhandledFrame = 'bypass',
}: {
  handlers?: RequestHandler[];
  onUnhandledFrame?: UnhandledFrameHandle;
} = {}) {
  return defineNetwork({
    sources: [
      new InterceptorSource({
        interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
      }),
    ],
    handlers,
    onUnhandledFrame,
    // No line in the console per request, as `quiet` does for the worker.
    context: { quiet: true },
  });
}
