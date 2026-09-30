import { createFileRoute, redirect } from '@tanstack/react-router';

// The API cannot filter audit events by flag yet, so this tab only
// ever showed an empty list. The URL stays reachable and lands on the flag.
export const Route = createFileRoute(
  '/feature-flags/$featureFlagSlug/audit-trail',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { featureFlagSlug: params.featureFlagSlug },
      replace: true,
      to: '/feature-flags/$featureFlagSlug',
    });
  },
});
