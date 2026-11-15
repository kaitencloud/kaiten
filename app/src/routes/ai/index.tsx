import { createFileRoute, redirect } from '@tanstack/react-router';

// The AI area opens on its rate card until it has an overview of its own.
export const Route = createFileRoute('/ai/')({
  beforeLoad: () => {
    throw redirect({ to: '/ai/pricing', replace: true });
  },
});
