# Unit tests

Unit tests run with Vitest, through Vite+, in jsdom. They cover pure logic (utilities, schemas, stores, read models), hooks, and components whose behaviour you can drive with Testing Library. They are the `unit` project of the Vitest configuration in `app/vite.config.ts`.

## Run them

Run these from `app/`. On a fresh clone, run `pnpm run generate` first: much of the code under test imports the generated API client.

| Command | What it does |
| --- | --- |
| `pnpm run test` | Runs every unit test once. App CI runs it, and so does `pnpm run check:ci`. |
| `pnpm run test:watch` | Runs them in watch mode. |
| `pnpm run test src/functionals/slug` | Runs the test files whose path contains the filter. |
| `pnpm run test -t "handle string with spaces"` | Runs the tests whose name matches. |
| `pnpm run test:coverage` | Runs them with V8 coverage. See [coverage](./coverage.md). |

Arguments after the script name go to Vitest: add `--reporter=verbose` to see each test name.

## Where tests live

A test file is named `<name>.test.ts` or `<name>.test.tsx`, and sits either next to the code it tests or in a `__tests__/` folder of the same module. The `unit` project picks up `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`.

| Test | Code under test |
| --- | --- |
| `src/functionals/slug/__tests__/slug.test.ts` | `src/functionals/slug/index.ts`, a pure function |
| `src/components/__tests__/destructive-action-button.test.tsx` | `src/components/destructive-action-button.tsx`, a component |
| `src/routes/-components/side-nav/__tests__/use-sidenav-lock.test.ts` | The shell-local viewport lock hook, through `renderHook` |
| `scripts/check-architecture.test.ts` | the architecture rules, run against virtual file lists |

When you change a rule in `scripts/architecture-rules.ts`, add a case to `scripts/check-architecture.test.ts`.

Test files are exempt from lint, from formatting and from the file-size limit, but not from the type check (`pnpm run typecheck` compiles them) or from the architecture check, which reads them like any other source file: a test follows the [import rules](../AI_CONTEXT.md#import-rules).

## What the environment gives you

The `unit` project pins auth and mock switches to `false`, clears the Clerk
and platform settings, and uses `http://api.test/api` before setup files import
modules. Shell exports and `.env.local` cannot change those defaults. The test
virtual dev-token module is empty, so a run never reads a local credential file.
Tests of a specific mode use `vi.stubEnv`, dynamically import modules after
`vi.resetModules`, and restore with `vi.unstubAllEnvs` and `vi.resetModules`.
In particular, feature-flag auth switches are captured at module load.

The `unit` project runs every test in jsdom, with a timeout of 10 seconds per test, after `src/__tests__/setup.ts`. That file:

- registers the `@testing-library/jest-dom` matchers, such as `toBeDisabled` and `toHaveTextContent`;
- raises Testing Library's `findBy*` and `waitFor` timeout to 5 seconds, because form fields are code-split and the first query of a cold run waits on a dynamic import;
- initialises i18next with one resource (`src/__tests__/test-i18n.ts`), so `t('Some.key')` returns `Some.key`: assert on the key, or mock `react-i18next` when a test needs real wording;
- stubs `ResizeObserver`, and gives jsdom an empty `getAnimations`, which Base UI's `ScrollArea` (the body of a `Page layout="scroll"`) asks its viewport for. Base UI waits for the animations of an overlay to end before it unmounts it, and only where that method exists, so the setup also sets its `BASE_UI_ANIMATIONS_DISABLED` switch: a dialog still unmounts at once in a test.

The `unit` project alone then runs `src/__tests__/msw-setup.ts` (setup files run
in list order), which:

- points the generated REST client at `env.API_URL`, an absolute URL, which fetch needs outside a page;
- starts Mock Service Worker's Node server (`src/__tests__/msw-server.ts`) before the tests and closes it after them. It answers nothing by default but the billing capabilities (billing off, which the app shell reads): a request that no test declared fails with a network error and an `[MSW]` error, and never reaches a real API. The handlers a test declares are dropped after it. See [mock the network](#mock-the-network).

Import `describe`, `it`, `expect` and `vi` from `vite-plus/test`, as the existing tests do.

## Write a test

A pure function:

```ts
// src/functionals/slug/__tests__/slug.test.ts
import { describe, it, expect } from 'vite-plus/test';
import { generateSlug } from '..';

describe('generateSlug', () => {
  it('should handle string with spaces', () => {
    expect(generateSlug('Test Feature Flag')).toBe('test-feature-flag');
  });
});
```

A component, driven the way a user would:

```tsx
// src/components/__tests__/destructive-action-button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { DestructiveActionButton } from '../destructive-action-button';

const baseProps = {
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  description: 'This cannot be undone.',
  label: 'Delete',
  onConfirm: vi.fn(),
  title: 'Delete this customer?',
};

describe('DestructiveActionButton', () => {
  it('asks for confirmation when enabled', async () => {
    const user = userEvent.setup();
    render(<DestructiveActionButton {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Delete this customer?',
    );
  });
});
```

Guidelines:

- Query by role, label or visible text, and assert on what the user sees. Interact with `@testing-library/user-event`.
- Mock the edges, not the unit: `vi.mock('@tanstack/react-router', ...)` for navigation hooks, `vi.mock('sonner', ...)` for toasts, and the network with Mock Service Worker rather than `vi.mock('@/api-client', ...)`: see [mock the network](#mock-the-network). `src/components/route/__tests__/route-error.test.tsx` mocks the router and `react-i18next`.
- A component that reads TanStack Query needs a `QueryClientProvider` with a fresh `QueryClient` per test, as in `src/features/customers/components/__tests__/customer-form.test.tsx`.
- Name a test after the behaviour it protects, so a failure reads as a sentence.

## Mock the network

A test that reaches the API keeps the generated client, its query options and its mutations, and declares what the API answers with `server.use(...)`. The handlers last until the end of the test.

```ts
// src/lib/api/__tests__/all-pages-query-options.test.ts (excerpt)
import { HttpResponse } from 'msw/http';
import { server } from '@/__tests__/msw-server';
import { handleListEntitlements } from '@/api-client/msw.gen';

const pageQueries: Array<Record<string, string>> = [];
server.use(
  handleListEntitlements(({ request }) => {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    pageQueries.push(query);
    return HttpResponse.json(
      query.cursor === 'c1'
        ? { hasMore: false, items: [entitlement('e2')] }
        : { hasMore: true, items: [entitlement('e1')], nextCursor: 'c1' },
    );
  }),
);
```

- A REST endpoint takes its generated handler from `@/api-client/msw.gen`, one per operation of the OpenAPI contract. `handleGetCustomer({ body: customer })` answers with a body typed by the operation. `handleCreateCustomer(async ({ params, request }) => ...)` reads the path params and `await request.json()` with their types, so the test can record what was sent.
- GraphQL is outside the contract: `graphqlOperationHandler({ GetCustomersWithInstances: (variables) => data })` from `@/e2e/msw/handler-factory`, the router of the E2E mocks, or `http.post('*/api/graphql', ...)` from `msw/http` for a raw answer, such as a 403.
- Assert on what reached the API, as `src/features/licenses/hooks/__tests__/use-license-save.test.tsx` does, rather than on the arguments of a mocked function. `JSON.stringify` drops `undefined` fields: an expected body leaves them out, as the request does.
- A failed request throws the parsed error body. `@/lib/api` wraps it in an `ApiError`, as in the app: a test whose subject reads the error's status or detail through `getApiErrorMessage` imports `@/lib/api` for that side effect, as `src/features/licenses/components/__tests__/license-lifecycle-action.test.tsx` does.
- Under fake timers, a request is answered over a few turns of the event loop and a few fake milliseconds, because jsdom's fetch, undici, waits on timers before it reuses a connection: `src/domains/crm-sync/queries/attio-sync-coordinator.test.ts` advances the clock by a few milliseconds where a mocked function resolved within microtasks.

## What belongs elsewhere

A test that needs the real router, several features or a mutation followed by a refresh is an [application E2E spec](./integration-tests.md#application-e2e-e2eapp). A component with several visual states is easier to review as a [story](./integration-tests.md#storybook-tests). The [testing overview](./README.md#which-test-to-write) says how to choose.
