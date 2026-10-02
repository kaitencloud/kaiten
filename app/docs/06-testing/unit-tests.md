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

The `unit` project runs every test in jsdom, with a timeout of 10 seconds per test, after `src/__tests__/setup.ts`. That file:

- registers the `@testing-library/jest-dom` matchers, such as `toBeDisabled` and `toHaveTextContent`;
- raises Testing Library's `findBy*` and `waitFor` timeout to 5 seconds, because form fields are code-split and the first query of a cold run waits on a dynamic import;
- initialises i18next with one resource (`src/__tests__/test-i18n.ts`), so `t('Some.key')` returns `Some.key`: assert on the key, or mock `react-i18next` when a test needs real wording;
- stubs `ResizeObserver`.

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
- Mock the edges, not the unit: `vi.mock('@tanstack/react-router', ...)` for navigation hooks, `vi.mock('sonner', ...)` for toasts, `vi.mock('@/api-client', ...)` for network calls. `src/components/route/__tests__/route-error.test.tsx` mocks the router and `react-i18next`.
- A component that reads TanStack Query needs a `QueryClientProvider` with a fresh `QueryClient` per test, as in `src/features/customers/components/__tests__/customer-form.test.tsx`.
- Name a test after the behaviour it protects, so a failure reads as a sentence.

## What belongs elsewhere

A test that needs the real router, several features or a mutation followed by a refresh is an [application E2E spec](./integration-tests.md#application-e2e-e2eapp). A component with several visual states is easier to review as a [story](./integration-tests.md#storybook-tests). The [testing overview](./README.md#which-test-to-write) says how to choose.
