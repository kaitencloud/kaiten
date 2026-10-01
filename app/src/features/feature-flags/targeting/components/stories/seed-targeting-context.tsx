import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TargetingContext } from '@/api-client';
import { getTargetingContextQueryKey } from '@/api-client/@tanstack/react-query.gen';

/**
 * The schema the editor's Context popover and Templates menu are driven by,
 * as the server would serve it — abbreviated but shape-faithful. Seeded into
 * the query cache so the stories show the toolbar the way the app does; a
 * story without it renders the degraded no-API toolbar, which has its own
 * value but hides most of the surface.
 */
const SERVED_TARGETING_CONTEXT: TargetingContext = {
  roots: [
    {
      name: '__kaiten',
      type: 'object',
      description: 'Facts the server computes for every evaluation.',
      fields: [
        {
          name: 'license',
          type: 'object',
          description: 'The license the organization holds.',
          fields: [
            {
              name: 'slug',
              type: 'string',
              description: "Slug of the license, e.g. 'scale'",
            },
            {
              name: 'type',
              type: 'string',
              description: "Whether the license is paid, e.g. 'PAID'",
            },
          ],
        },
        {
          name: 'entitlements',
          type: 'map',
          description: 'Entitlement usage, keyed by slug.',
          knownKeys: ['seats', 'customers', 'instances'],
          values: {
            name: '',
            type: 'object',
            fields: [
              {
                name: 'remaining',
                type: 'number',
                description: 'Ceiling minus usage.',
              },
              {
                name: 'percentage',
                type: 'number',
                description: 'Share of the ceiling consumed, between 0 and 1.',
              },
              {
                name: 'unlimited',
                type: 'boolean',
                description: 'True when the entitlement has no ceiling.',
              },
            ],
          },
        },
        {
          name: 'instance',
          type: 'object',
          description: 'The instance being evaluated.',
          fields: [
            { name: 'id', type: 'string', description: 'Identifier.' },
            { name: 'slug', type: 'string', description: 'Instance slug.' },
            { name: 'name', type: 'string', description: 'Display name.' },
            {
              name: 'status',
              type: 'string',
              description: "Operational status, e.g. 'HEALTHY'.",
            },
            {
              name: 'metadata',
              type: 'map',
              description: 'Free-form metadata.',
              values: { name: '', type: 'dyn' },
            },
          ],
        },
        {
          name: 'deploymentZone',
          type: 'object',
          description: 'The deployment zone the instance runs in.',
          fields: [
            { name: 'slug', type: 'string', description: 'Zone slug.' },
            {
              name: 'type',
              type: 'string',
              description: "Environment class, e.g. 'production'.",
            },
          ],
        },
      ],
    },
    {
      name: 'targetingKey',
      type: 'string',
      description: 'The key this evaluation is bucketed on. Always present.',
    },
  ],
};

// The rule editor reads this context through useQuery, and Storybook never
// points the REST client at an API: an editor rendered without it asks the
// Storybook server for /api/feature-flags/targeting/context and logs the 404.
export function SeedTargetingContext({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  queryClient.setQueryData(
    getTargetingContextQueryKey(),
    SERVED_TARGETING_CONTEXT,
  );

  return children;
}
