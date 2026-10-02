import { afterAll, afterEach, beforeAll } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import env from '@/env';
import { server } from './msw-server';

// Setup of the `unit` project only (app/vite.config.ts): the `storybook` one
// runs in a browser, where `msw/node` does not load and stories declare their
// own handlers (.storybook/msw.ts).

// The generated client defaults to the relative `/api`, which fetch cannot
// resolve outside a page. It gets the absolute URL the app's own setup gives it
// (`configureApiClient`, `@/lib/api/configure-api-client`), so that a test's
// requests reach the mock server; the interceptors of that setup stay out, for
// the tests that call it.
client.setConfig({ baseUrl: env.API_URL });

// Every request goes to Mock Service Worker. One that no test declared fails
// instead of reaching the network: see msw-server.ts.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
