import { SignUp } from '@clerk/react';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/sign-up')({
  // Local auth has no Clerk provider: the dev account picker is the way in,
  // and this page would only throw.
  beforeLoad: () => {
    if (import.meta.env.VITE_LOCAL_AUTH === 'true') {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: () => <SignUp />,
});
