import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleArchiveMetadataField,
  handleCreateMetadataField,
  handleDryRunMetadataField,
  handleUpdateMetadataField,
} from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { MetadataFieldsPageContent } from '../metadata-fields-page-content';
import { metadataFieldsSettingsQueryKey } from '../metadata-fields.queries';
import { metadataFieldsActiveQueryKey } from '@/domains/metadata-fields';
import type { MetadataSettingsField } from '../types';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const activeField: MetadataSettingsField = {
  displayOrder: 0,
  id: 'field-region',
  jsonSchema: {
    description: 'Region used by the resource',
    enum: ['ca', 'eu'],
    type: 'string',
  },
  key: 'region',
  label: 'Region',
  resourceType: 'DEPLOYMENT_ZONE',
};

const archivedField: MetadataSettingsField = {
  archivedAt: '2026-01-01T00:00:00Z',
  displayOrder: 1,
  id: 'field-legacy',
  jsonSchema: { type: 'boolean' },
  key: 'legacy',
  label: 'Legacy',
  resourceType: 'DEPLOYMENT_ZONE',
};

// The metadataFields query returns a cursor-paginated envelope. Every case
// here fits on one page, so hasMore stays false and fetchMetadataFields stops
// after a single request.
const metadataFieldsPage = (...items: MetadataSettingsField[]) => ({
  metadataFields: { hasMore: false, items, nextCursor: null },
});

type ApiCall =
  | { op: 'archive'; id: string }
  | { op: 'create'; body: unknown }
  | { op: 'dryRun'; id: string; body: unknown }
  | { op: 'update'; id: string; body: unknown };

/**
 * Serves the page's read (the GraphQL metadataFields query, answered with
 * `fields`) and the REST writes the tests drive, and records the writes in the
 * order the API received them, with the id and the body each one carried.
 */
function serveMetadataFields(
  fields: MetadataSettingsField[] = [activeField, archivedField],
) {
  const calls: ApiCall[] = [];

  server.use(
    graphqlOperationHandler({
      MetadataFields: () => metadataFieldsPage(...fields),
    }),
    handleArchiveMetadataField(({ params }) => {
      calls.push({ op: 'archive', id: params.id });
      return HttpResponse.json(archivedField);
    }),
    handleCreateMetadataField(async ({ request }) => {
      calls.push({ op: 'create', body: await request.json() });
      return HttpResponse.json(activeField, { status: 201 });
    }),
    // The server-side dry-run goes through the generated REST SDK, not
    // GraphQL — the page hook calls `dryRunMetadataField` directly.
    handleDryRunMetadataField(async ({ params, request }) => {
      calls.push({ op: 'dryRun', id: params.id, body: await request.json() });
      return HttpResponse.json({ count: 0, samples: [] });
    }),
    handleUpdateMetadataField(async ({ params, request }) => {
      calls.push({ op: 'update', id: params.id, body: await request.json() });
      return HttpResponse.json(activeField);
    }),
  );

  return calls;
}

// The problem the API answers a caller that lacks the scope a request needs.
const missingScope = (scope: string, instance: string) =>
  HttpResponse.json(
    {
      title: 'Forbidden',
      status: 403,
      detail: `missing required scope: ${scope}`,
      instance,
      code: 'Auth.MissingScope',
    },
    {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  );

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });
}

function renderPage(queryClient = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MetadataFieldsPageContent resourceType="DEPLOYMENT_ZONE" />
    </QueryClientProvider>,
  );
}

describe('MetadataFieldsPageContent', () => {
  let calls: ApiCall[];

  beforeEach(() => {
    calls = serveMetadataFields();
  });

  it('shows resource tabs and active fields by default', async () => {
    renderPage();

    expect(await screen.findByText('Metadata fields')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Deployment Zones/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Instances/i })).toBeInTheDocument();
    expect(await screen.findByText('Region')).toBeInTheDocument();
    expect(screen.queryByText('Legacy')).not.toBeInTheDocument();
  });

  it('pre-fills the edit dialog and keeps the key immutable', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Edit/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('region');
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByLabelText('Label')).toHaveValue('Region');
    expect(screen.getByLabelText('Options')).toHaveValue('ca\neu');
  });

  it('requires confirmation before archiving a field', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Archive/i }));

    expect(
      screen.getByRole('alertdialog', { name: /Archive metadata field/i }),
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /^Archive$/i,
      }),
    );

    await waitFor(() => {
      expect(calls).toEqual([{ op: 'archive', id: 'field-region' }]);
    });
  });

  it('shows the restricted state when the metadata fields query is forbidden', async () => {
    // A bare 403, with no body to say why.
    server.use(
      http.post('*/api/graphql', () => new HttpResponse(null, { status: 403 })),
    );

    renderPage();

    expect(await screen.findByText('Restricted access')).toBeInTheDocument();
  });

  // The page is given what the client throws for the problem a missing scope
  // actually answers, rather than a hand-built error.
  it('shows the restricted state when the API refuses the read for a missing scope', async () => {
    server.use(
      http.post('*/api/graphql', () =>
        missingScope('read:metadata_fields', '/api/graphql'),
      ),
    );

    renderPage();

    expect(await screen.findByText('Restricted access')).toBeInTheDocument();
    expect(
      screen.queryByText('Unable to load fields'),
    ).not.toBeInTheDocument();
  });

  it('shows a restricted banner and disables mutations after a forbidden mutation', async () => {
    const user = userEvent.setup();
    server.use(
      handleArchiveMetadataField(({ params }) =>
        missingScope(
          'write:metadata_fields',
          `/api/metadata-fields/${params.id}/archive`,
        ),
      ),
    );
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Archive/i }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: /^Archive$/i,
      }),
    );

    expect(
      await screen.findByText(/Restricted access was returned by the API/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Create field/i }),
    ).toBeDisabled();
  });

  // PATCH must not carry `displayOrder`. Reordering is
  // owned by the dedicated /reorder endpoint to avoid stale snapshots from
  // a long-running edit dialog rewinding the ordering.
  it('does not send displayOrder in the update PATCH body', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Edit/i }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Cloud Region');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(calls.map(({ op }) => op)).toContain('update');
    });
    // key and resourceType are echoed back from the record being edited --
    // both are immutable, so there is no staleness risk (see
    // schema.MetadataField's doc comment); displayOrder is the one field
    // that must never be echoed back, since it can change from underneath
    // a long-running edit dialog.
    expect(calls).toEqual([
      {
        op: 'update',
        id: 'field-region',
        body: {
          jsonSchema: expect.any(Object),
          key: 'region',
          label: 'Cloud Region',
          resourceType: 'DEPLOYMENT_ZONE',
        },
      },
    ]);
    expect(calls[0]).not.toHaveProperty('body.displayOrder');
  });

  it('invalidates settings and active metadata queries after create', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderPage(queryClient);

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Create field/i }));
    await user.type(screen.getByLabelText('Key'), 'tier');
    await user.type(screen.getByLabelText('Label'), 'Tier');
    await user.click(screen.getByRole('button', { name: /^Create$/i }));

    // The invalidations run once the API has answered the create, a round
    // trip after it received it.
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: metadataFieldsSettingsQueryKey('DEPLOYMENT_ZONE'),
      });
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: metadataFieldsActiveQueryKey('DEPLOYMENT_ZONE'),
    });
    expect(calls).toEqual([
      {
        op: 'create',
        body: expect.objectContaining({
          key: 'tier',
          label: 'Tier',
          resourceType: 'DEPLOYMENT_ZONE',
        }),
      },
    ]);
  });

  // Required-field errors must not flash on open: they appear only after a
  // field is blurred (or a submit is attempted), mirroring the TanStack Form
  // `isTouched` gate used by the shared form fields.
  it('defers required-field errors until a field is touched', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Create field/i }));

    // Dialog open with empty fields — no error text yet.
    expect(screen.getByLabelText('Key')).toHaveValue('');
    expect(screen.queryByText('Key is required.')).not.toBeInTheDocument();
    expect(screen.queryByText('Label is required.')).not.toBeInTheDocument();

    // Blurring the empty Key field reveals only its error.
    await user.click(screen.getByLabelText('Key'));
    await user.tab();
    expect(await screen.findByText('Key is required.')).toBeInTheDocument();
    expect(screen.queryByText('Label is required.')).not.toBeInTheDocument();
  });

  // A description-only change must skip the dry-run.
  it('skips the dry-run fetch when only the description changed', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Edit/i }));
    await user.clear(screen.getByLabelText('Description'));
    await user.type(
      screen.getByLabelText('Description'),
      'Region used by deployments',
    );
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(calls.map(({ op }) => op)).toContain('update');
    });
    // The server-side dry-run endpoint would have been called if the diff had
    // been picked up as structural — a description-only edit must skip it.
    expect(calls.map(({ op }) => op)).not.toContain('dryRun');
  });

  it('opens a duplicate dialog pre-filled with the source field, sans key', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Duplicate/i }));

    expect(
      screen.getByRole('heading', { name: /Duplicate metadata field/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('');
    expect(screen.getByLabelText('Key')).not.toBeDisabled();
    expect(screen.getByLabelText('Label')).toHaveValue('Region');
    expect(screen.getByLabelText('Options')).toHaveValue('ca\neu');
  });

  // Extra warning when the field being archived is the
  // last active one for the resource type.
  it('warns the admin when archiving the last active field', async () => {
    const user = userEvent.setup();
    // Only one active field, no archived ones — so archiving leaves the
    // resource type with zero schema-bound metadata.
    serveMetadataFields([activeField]);
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Archive/i }));

    expect(
      await screen.findByText(/last active field for this resource/i),
    ).toBeInTheDocument();
  });
});
