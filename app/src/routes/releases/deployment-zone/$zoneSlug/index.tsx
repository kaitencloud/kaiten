import { createFileRoute, redirect } from '@tanstack/react-router';

// Zone pages moved to /releases/deployment-zones/$zoneSlug, beside their edit
// and deploy routes. The old singular URL still lands on the zone.
export const Route = createFileRoute('/releases/deployment-zone/$zoneSlug/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { zoneSlug: params.zoneSlug },
      replace: true,
      to: '/releases/deployment-zones/$zoneSlug',
    });
  },
});
