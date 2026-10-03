import type { RequestHandler, UnhandledFrameHandle } from 'msw';
import { setupWorker } from 'msw/browser';
import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';
import { createMockHandlers, undeclaredApiRequest } from './handlers';
import { createPageNetwork } from './page-network';
import {
  persistSlot,
  readStoredConfig,
  writeStoredConfig,
} from './persistence';

type StartOptions = {
  unmockedFlags?: 'off' | 'passthrough';
  warnUnhandledApiRequests?: boolean;
};
type MockWindow = Window & {
  __KAITEN_MSW_RUNNING__?: {
    resetHandlers: (...handlers: RequestHandler[]) => void;
  };
};

/**
 * E2E is strict; dev warns and passes through; partial notification mocks pass
 * through with real flags. A reload preserves session state, while an HMR
 * restart uses the edited seed. With service workers blocked, fetch/XHR are
 * intercepted in the page instead (not EventSource).
 */
export async function startE2EMockServiceWorker(
  config: E2EMswConfig,
  {
    unmockedFlags = 'off',
    warnUnhandledApiRequests = false,
  }: StartOptions = {},
) {
  const page = window as MockWindow;
  const running = page.__KAITEN_MSW_RUNNING__;
  const effectiveConfig = running
    ? config
    : { ...config, ...readStoredConfig() };
  writeStoredConfig(effectiveConfig);
  const strict = unmockedFlags === 'off' && !warnUnhandledApiRequests;
  const handlers = [
    ...createMockHandlers(effectiveConfig, unmockedFlags, persistSlot, strict),
    ...(strict ? [undeclaredApiRequest] : []),
  ];
  if (running) {
    running.resetHandlers(...handlers);
    return;
  }
  const onUnhandledFrame: UnhandledFrameHandle = warnUnhandledApiRequests
    ? ({ frame, defaults }) => {
        if (
          frame.protocol === 'http' &&
          new URL(
            (frame.data as { request: Request }).request.url,
          ).pathname.startsWith('/api/')
        ) {
          defaults.warn();
        }
      }
    : 'bypass';
  try {
    const worker = setupWorker(...handlers);
    await worker.start({
      onUnhandledFrame,
      quiet: true,
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
    page.__KAITEN_MSW_RUNNING__ = worker;
  } catch (error) {
    console.warn(
      '[MSW] The mock service worker could not start; mocking in the page instead, without the notification stream.',
      error,
    );
    const network = createPageNetwork({ handlers, onUnhandledFrame });
    network.enable();
    page.__KAITEN_MSW_RUNNING__ = network;
  }
}
