import type { ReactNode } from 'react';

type Navigation = {
  search?: (previous: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * Stands in for the router in the tests of the rate card: `useNavigate` hands
 * each navigation to whoever listens (the harness, which holds the search as
 * the URL would), and a `Link` is a plain anchor.
 */
export const router = {
  listener: undefined as ((navigation: Navigation) => void) | undefined,
  navigations: [] as Navigation[],
};

/** The options the page last gave the router's blocker, for a test to call. */
type BlockerOptions = {
  enableBeforeUnload?: boolean | (() => boolean);
  shouldBlockFn: (locations: {
    action: string;
    current: { pathname: string; search: unknown };
    next: { pathname: string; search: unknown };
  }) => boolean | Promise<boolean>;
};

export const blocker = {
  options: undefined as BlockerOptions | undefined,
  /** `blocked` once a test says a navigation was stopped. */
  status: 'idle' as 'blocked' | 'idle',
  proceeded: 0,
  resets: 0,
};

export const routerMock = {
  useBlocker: (options: BlockerOptions) => {
    blocker.options = options;

    return {
      proceed: () => {
        blocker.proceeded += 1;
        blocker.status = 'idle';
      },
      reset: () => {
        blocker.resets += 1;
        blocker.status = 'idle';
      },
      status: blocker.status,
    };
  },
  Link: ({ children, to }: { children?: ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => (navigation: Navigation) => {
    router.navigations.push(navigation);
    router.listener?.(navigation);

    return Promise.resolve();
  },
};
