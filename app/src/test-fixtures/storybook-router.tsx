import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  useContext,
  useState,
} from 'react';

type StorybookRouterProps = PropsWithChildren<{
  initialEntries?: string[];
  routePath?: string;
  /**
   * Fills the cache for a query that no request answers in Storybook, such as
   * a platform flag (`lib/feature-flags`), whose source needs a signed-in user.
   * What the API answers goes in the story's handlers instead
   * (`parameters.msw`, see `.storybook/msw.ts`).
   */
  seed?: (queryClient: QueryClient) => void;
}>;

// The router instance is built once, but the story's children change whenever a
// control moves. Passing them through context keeps the route component honest:
// it reads the current children while rendering, with no ref written during
// render to smuggle them in.
const StoryChildrenContext = createContext<ReactNode>(null);

function StoryChildren() {
  return <>{useContext(StoryChildrenContext)}</>;
}

export function StorybookRouter({
  children,
  initialEntries = ['/'],
  routePath,
  seed,
}: StorybookRouterProps) {
  const queryClient = useQueryClient();

  const [history] = useState(() => createMemoryHistory({ initialEntries }));

  const [router] = useState(() => {
    // Seeded in the initializer so it runs exactly once, before the story's
    // children first render and read the cache.
    seed?.(queryClient);

    if (routePath) {
      const rootRoute = createRootRoute({
        component: () => <Outlet />,
      });
      const storyRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: routePath,
        component: StoryChildren,
      });

      return createRouter({
        routeTree: rootRoute.addChildren([storyRoute]),
        history,
        context: { queryClient },
      });
    }

    const rootRoute = createRootRoute({
      component: StoryChildren,
    });

    return createRouter({
      routeTree: rootRoute,
      history,
      context: { queryClient },
    });
  });

  return (
    <StoryChildrenContext.Provider value={children}>
      <RouterProvider router={router} />
    </StoryChildrenContext.Provider>
  );
}
