import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { MetadataFieldsPageContent } from '../metadata-fields-page-content';
import { metadataFieldsSettingsQueryKey } from '../metadata-fields.queries';
import { metadataFieldsActiveQueryKey } from '@/domains/metadata-fields';
import type { MetadataSettingsField } from '../types';

const {
  archiveMetadataFieldMock,
  createMetadataFieldMock,
  dryRunMetadataFieldMock,
  graphqlRequestMock,
  reorderMetadataFieldsMock,
  unarchiveMetadataFieldMock,
  updateMetadataFieldMock,
} = vi.hoisted(() => ({
  archiveMetadataFieldMock: vi.fn(),
  createMetadataFieldMock: vi.fn(),
  dryRunMetadataFieldMock: vi.fn(),
  graphqlRequestMock: vi.fn(),
  reorderMetadataFieldsMock: vi.fn(),
  unarchiveMetadataFieldMock: vi.fn(),
  updateMetadataFieldMock: vi.fn(),
}));

vi.mock('@/lib/graphql-client', () => ({
  graphqlClient: {
    request: graphqlRequestMock,
  },
}));

// The server-side dry-run goes through the generated REST SDK, not
// GraphQL — the page hook calls `dryRunMetadataField` directly.
vi.mock('@/api-client/sdk.gen', () => ({
  dryRunMetadataField: dryRunMetadataFieldMock,
}));

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  archiveMetadataFieldMutation: () => ({
    mutationFn: archiveMetadataFieldMock,
  }),
  createMetadataFieldMutation: () => ({
    mutationFn: createMetadataFieldMock,
  }),
  reorderMetadataFieldsMutation: () => ({
    mutationFn: reorderMetadataFieldsMock,
  }),
  unarchiveMetadataFieldMutation: () => ({
    mutationFn: unarchiveMetadataFieldMock,
  }),
  updateMetadataFieldMutation: () => ({
    mutationFn: updateMetadataFieldMock,
  }),
}));

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
  beforeEach(() => {
    graphqlRequestMock.mockReset();
    archiveMetadataFieldMock.mockReset();
    createMetadataFieldMock.mockReset();
    dryRunMetadataFieldMock.mockReset();
    reorderMetadataFieldsMock.mockReset();
    unarchiveMetadataFieldMock.mockReset();
    updateMetadataFieldMock.mockReset();

    graphqlRequestMock.mockResolvedValue(
      metadataFieldsPage(activeField, archivedField),
    );
    archiveMetadataFieldMock.mockResolvedValue(archivedField);
    createMetadataFieldMock.mockResolvedValue(activeField);
    dryRunMetadataFieldMock.mockResolvedValue({ data: { count: 0, samples: [] } });
    reorderMetadataFieldsMock.mockResolvedValue(undefined);
    unarchiveMetadataFieldMock.mockResolvedValue(activeField);
    updateMetadataFieldMock.mockResolvedValue(activeField);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      expect(archiveMetadataFieldMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 'field-region' },
        }),
        expect.any(Object),
      );
    });
  });

  it('shows the restricted state when the metadata fields query is forbidden', async () => {
    graphqlRequestMock.mockRejectedValueOnce(new Error('403 forbidden'));

    renderPage();

    expect(await screen.findByText('Restricted access')).toBeInTheDocument();
  });

  // The real client answers this read, so the page is given what a missing
  // scope actually throws rather than a hand-built error.
  it('shows the restricted state when the API refuses the read for a missing scope', async () => {
    const { GraphQLClient } = await vi.importActual<
      typeof import('@/lib/graphql-client')
    >('@/lib/graphql-client');
    const client = new GraphQLClient('http://api.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              title: 'Forbidden',
              status: 403,
              detail: 'missing required scope: read:metadata_fields',
              instance: '/api/graphql',
              code: 'Auth.MissingScope',
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          ),
      ),
    );
    graphqlRequestMock.mockImplementationOnce((query, variables) =>
      client.request(query, variables),
    );

    renderPage();

    expect(await screen.findByText('Restricted access')).toBeInTheDocument();
    expect(
      screen.queryByText('Unable to load fields'),
    ).not.toBeInTheDocument();
  });

  it('shows a restricted banner and disables mutations after a forbidden mutation', async () => {
    const user = userEvent.setup();
    archiveMetadataFieldMock.mockRejectedValueOnce(new Error('403 forbidden'));
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
      expect(updateMetadataFieldMock).toHaveBeenCalled();
    });
    const [[args]] = updateMetadataFieldMock.mock.calls;
    // key and resourceType are echoed back from the record being edited --
    // both are immutable, so there is no staleness risk (see
    // schema.MetadataField's doc comment); displayOrder is the one field
    // that must never be echoed back, since it can change from underneath
    // a long-running edit dialog.
    expect(args.body).toEqual({
      jsonSchema: expect.any(Object),
      key: 'region',
      label: 'Cloud Region',
      resourceType: 'DEPLOYMENT_ZONE',
    });
    expect(args.body).not.toHaveProperty('displayOrder');
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

    await waitFor(() => {
      expect(createMetadataFieldMock).toHaveBeenCalled();
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: metadataFieldsSettingsQueryKey('DEPLOYMENT_ZONE'),
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: metadataFieldsActiveQueryKey('DEPLOYMENT_ZONE'),
    });
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
      expect(updateMetadataFieldMock).toHaveBeenCalled();
    });
    // The server-side dry-run endpoint would have been called if the diff had
    // been picked up as structural — a description-only edit must skip it.
    expect(dryRunMetadataFieldMock).not.toHaveBeenCalled();
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
    graphqlRequestMock.mockResolvedValue(metadataFieldsPage(activeField));
    renderPage();

    await screen.findByText('Region');
    await user.click(screen.getByRole('button', { name: /Archive/i }));

    expect(
      await screen.findByText(/last active field for this resource/i),
    ).toBeInTheDocument();
  });
});
