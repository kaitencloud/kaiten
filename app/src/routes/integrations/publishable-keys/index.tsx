import { createFileRoute } from '@tanstack/react-router';

// The list is drawn by the layout route (`route.tsx`), which keeps it mounted under the
// dialogs of the routes beside this one; this route adds nothing to it.
export const Route = createFileRoute('/integrations/publishable-keys/')({
  component: () => null,
});
