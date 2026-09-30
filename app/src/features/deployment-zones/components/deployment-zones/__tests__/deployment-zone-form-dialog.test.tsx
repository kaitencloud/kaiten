import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DeploymentZoneFormDialog } from '../deployment-zone-form-dialog';
import { sanitizeTypedMetadataValue } from '../deployment-zone-metadata-fields';

const mockStackedFormDialog = vi.fn();

// The dialog reads the active MetadataField list to decide between the
// typed DynamicForm and the raw-JSON fallback. Tests
// drive the underlying query result by mutating `metadataFieldsStub`
// before render.
const metadataFieldsStub = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));
const deploymentZoneFormArgsStub = vi.hoisted(() => ({
  current: null as null | {
    prepareValues?: (values: {
      description: string;
      metadata?: Record<string, unknown>;
      name: string;
      type: string;
    }) => {
      description: string;
      metadata?: Record<string, unknown>;
      name: string;
      type: string;
    };
  },
}));
// The empty metadata state links to the settings; the test has no router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/domains/metadata-fields', () => ({
  metadataFieldsActiveQueryOptions: () => ({
    queryFn: async () => metadataFieldsStub.rows,
    queryKey: ['stub', 'metadata-fields', 'DEPLOYMENT_ZONE'],
  }),
}));

// The type field suggests the types the organization already uses; the
// tests start from an organization with no zones.
vi.mock('../../../queries', () => ({
  deploymentZonesQueryOptions: {
    queryFn: async () => ({ hasMore: false, items: [] }),
    queryKey: ['stub', 'deployment-zones'],
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/form', () => ({
  createFormSubmitHandler: () => () => undefined,
}));

vi.mock('@/functionals/stacked-form-dialog', () => ({
  StackedFormDialog: (props: {
    children: React.ReactNode;
    className?: string;
    confirmOnClose?: boolean;
    title: string;
  }) => {
    mockStackedFormDialog(props);
    return (
      <div>
        <div>{props.title}</div>
        {props.children}
      </div>
    );
  },
  StackedFormDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stacked-form-dialog-footer">{children}</div>
  ),
  StackedFormDialogPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('../../../hooks/use-deployment-zone-form', () => ({
  useDeploymentZoneForm: (args: {
    prepareValues?: (values: {
      description: string;
      metadata?: Record<string, unknown>;
      name: string;
      type: string;
    }) => {
      description: string;
      metadata?: Record<string, unknown>;
      name: string;
      type: string;
    };
  }) => {
    deploymentZoneFormArgsStub.current = args;

    return {
      form: {
        AppField: ({
          children,
        }: {
          children: (field: {
            ComboboxField: (props: { label: string }) => React.ReactNode;
            SelectField: (props: { label: string }) => React.ReactNode;
            TextAreaField: (props: { label: string }) => React.ReactNode;
            TextField: (props: { label: string }) => React.ReactNode;
            handleChange: (value: unknown) => void;
          }) => React.ReactNode;
        }) =>
          children({
            ComboboxField: ({ label }: { label: string }) => <div>{label}</div>,
            SelectField: ({ label }: { label: string }) => <div>{label}</div>,
            TextAreaField: ({ label }: { label: string }) => <div>{label}</div>,
            TextField: ({ label }: { label: string }) => <div>{label}</div>,
            handleChange: vi.fn(),
          }),
        AppForm: ({ children }: { children: React.ReactNode }) => children,
        SubmitButton: ({
          label,
          ...props
        }: {
          label: string;
          form?: string;
        }) => (
          <button type="submit" {...props}>
            {label}
          </button>
        ),
        handleSubmit: vi.fn(),
      },
      isEditing: false,
      isLoading: false,
    };
  },
}));

vi.mock('../../../hooks/use-deployment-zone-form-dialog-store', () => ({
  useDeploymentZoneFormDialogStore: () => ({
    featuresError: null,
    featuresJson: '{}',
    resetFeaturesState: vi.fn(),
    setFeaturesError: vi.fn(),
    setFeaturesJson: vi.fn(),
  }),
}));

describe('DeploymentZoneFormDialog', () => {
  beforeEach(() => {
    metadataFieldsStub.rows = [];
    deploymentZoneFormArgsStub.current = null;
  });

  it('sanitizes typed metadata to active schema keys before write', () => {
    expect(
      sanitizeTypedMetadataValue(
        {
          empty: '',
          legacyHost: 'legacy.example.test',
          region: 'eu',
          replicas: 0,
          trial: false,
        },
        [
          {
            archivedAt: null,
            displayOrder: 0,
            id: 'field-region',
            jsonSchema: { type: 'string' },
            key: 'region',
            label: 'Region',
          },
          {
            archivedAt: null,
            displayOrder: 1,
            id: 'field-replicas',
            jsonSchema: { type: 'number' },
            key: 'replicas',
            label: 'Replicas',
          },
          {
            archivedAt: null,
            displayOrder: 2,
            id: 'field-trial',
            jsonSchema: { type: 'boolean' },
            key: 'trial',
            label: 'Trial',
          },
          {
            archivedAt: null,
            displayOrder: 3,
            id: 'field-empty',
            jsonSchema: { type: 'string' },
            key: 'empty',
            label: 'Empty',
          },
        ],
      ),
    ).toEqual({
      region: 'eu',
      replicas: 0,
      trial: false,
    });
  });

  it('returns undefined when no active metadata value remains', () => {
    expect(
      sanitizeTypedMetadataValue(
        {
          legacyHost: 'legacy.example.test',
          region: '',
        },
        [
          {
            archivedAt: null,
            displayOrder: 0,
            id: 'field-region',
            jsonSchema: { type: 'string' },
            key: 'region',
            label: 'Region',
          },
        ],
      ),
    ).toBeUndefined();
  });

  it('uses the stacked CRUD shell and closes on cancel', async () => {
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentZoneFormDialog open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );

    expect(mockStackedFormDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        className: 'sm:max-w-2xl',
        confirmOnClose: false,
        title: 'Features.Releases.Form.createZone',
      }),
    );

    // findByRole waits for the React Query state to settle so the Cancel
    // button is mounted by the time we click. fireEvent is preferred over
    // userEvent here: under React 19, the post-query re-render can detach
    // the node mid-pointer-sequence and swallow the callback.
    const cancelButton = await screen.findByRole('button', {
      name: 'Common.cancel',
    });
    const form = document.querySelector('form');
    const submitButton = screen.getByRole('button', { name: 'Common.create' });

    expect(form?.id).toBeTruthy();
    expect(submitButton).toHaveAttribute('form', form?.id);

    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // When active MetadataField rows exist, the form renders the
  // DynamicForm (with typed inputs per field) instead of the raw-JSON
  // textarea. Verifying via the field label keeps the test resilient to
  // the helper's exact DOM shape.
  it('renders the dynamic form when active MetadataField rows exist', async () => {
    metadataFieldsStub.rows = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string', enum: ['eu', 'us'] },
        key: 'region',
        label: 'Region',
        resourceType: 'DEPLOYMENT_ZONE',
      },
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentZoneFormDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    // DynamicForm renders one label per field; the Region descriptor
    // produces a <label for="field-region"> tied to the typed input.
    const regionLabel = await screen.findByLabelText('Region');
    expect(regionLabel).toBeInTheDocument();
    // The raw-JSON textarea must NOT be on screen when the typed form is
    // active.
    expect(
      screen.queryByPlaceholderText(
        '{"region": "eu-west-1", "cluster": "prod"}',
      ),
    ).not.toBeInTheDocument();
  });

  it('sanitizes metadata on submit even when typed inputs are untouched', async () => {
    metadataFieldsStub.rows = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string' },
        key: 'region',
        label: 'Region',
        resourceType: 'DEPLOYMENT_ZONE',
      },
    ];

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeploymentZoneFormDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Region');
    const prepareValues = deploymentZoneFormArgsStub.current?.prepareValues;

    expect(prepareValues).toBeDefined();
    expect(
      prepareValues?.({
        description: 'Production zone',
        metadata: {
          legacyHost: 'legacy.example.test',
          region: 'eu',
        },
        name: 'Production EU',
        type: 'production',
      }),
    ).toEqual({
      description: 'Production zone',
      metadata: {
        region: 'eu',
      },
      name: 'Production EU',
      type: 'production',
    });
  });
});
