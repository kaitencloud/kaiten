import { createFileRoute } from '@tanstack/react-router';

// The tab itself is drawn by the layout route (`route.tsx`), which keeps it
// mounted under the dialogs of the routes beside this one; this route adds
// nothing to it.
export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/',
)({
  component: () => null,
});
