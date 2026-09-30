import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { EntitlementForm } from '../entitlement-form';

// Mock external dependencies only
const mockNavigate = vi.fn();

// The Subscribe mock reads this, so a test can drive the branches that key off
// aggregationMethod and resetPeriod.
const formState = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));
const defaultFormValues = {
  type: 'NUMBER',
  aggregationMethod: 'SUM',
  resetPeriod: 'NONE',
};
const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouteContext: () => ({ queryClient: mockQueryClient }),
  useRouter: () => ({
    navigate: mockNavigate,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'Pages.Entitlements.Mutation.Form.Labels.name': 'Nom',
        'Pages.Entitlements.Mutation.Form.Labels.description': 'Description',
        'Pages.Entitlements.Mutation.Form.Labels.type': 'Type',
        'Pages.Entitlements.Mutation.Form.Labels.aggregationMethod':
          "Méthode d'agrégation",
        'Pages.Entitlements.Mutation.Form.Placeholders.name': 'Entrez le nom',
        'Pages.Entitlements.Mutation.Form.Placeholders.description':
          'Entrez la description',
        'Pages.Entitlements.Mutation.Form.createButton': 'Créer',
        'Pages.Entitlements.Mutation.Form.updateButton': 'Mettre à jour',
        'Pages.Entitlements.Mutation.Form.Errors.name': 'Le nom est requis',
        'Pages.Entitlements.Mutation.Form.Labels.units': 'Unités',
        'Pages.Entitlements.Mutation.Form.Labels.unitSingular':
          'Unité (singulier)',
        'Pages.Entitlements.Mutation.Form.Labels.unitPlural': 'Unité (pluriel)',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitsToggle':
          'La fonctionnalité est vendue dans une unité différente',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitSingular':
          'Unité de vente (singulier)',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitPlural':
          'Unité de vente (pluriel)',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactor': 'Calcul',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactorOne':
          'Une unité de vente',
        'Pages.Entitlements.Mutation.Form.Labels.saleUnitFactorValue':
          'Unités de base par unité de vente',
        'Pages.Entitlements.Mutation.Form.Labels.userFacing':
          'Visible côté client',
        'Pages.Entitlements.Mutation.Form.Labels.displayOrder':
          "Ordre d'affichage",
        'Pages.Entitlements.Mutation.Form.Labels.resetPeriod':
          "Remise à zéro de l'usage",
        'Pages.Entitlements.Mutation.Form.Labels.resetAnchor':
          'Fenêtre alignée sur',
        'Pages.Entitlements.Mutation.Form.Descriptions.resetPeriodLatest':
          '« Dernier » ne peut pas être combiné à une remise à zéro périodique.',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../entitlement-group-selector', () => ({
  EntitlementGroupSelector: () => (
    <div data-testid="entitlement-group-selector" />
  ),
}));

vi.mock('@/components/form/fields/form-field', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: (field: {
      handleBlur: () => void;
      handleChange: (value: string[]) => void;
      value: string[];
    }) => ReactNode;
    description?: string;
    label?: string;
  }) => (
    <div>
      {label ? <label>{label}</label> : null}
      {description ? <div>{description}</div> : null}
      {children({
        handleBlur: vi.fn(),
        handleChange: vi.fn(),
        value: [],
      })}
    </div>
  ),
}));

// Mock API calls
vi.mock('@/api-client', () => ({
  createEntitlement: vi.fn().mockResolvedValue({}),
  updateEntitlement: vi.fn().mockResolvedValue({}),
}));

// Mock Zod schema
vi.mock('@/api-client/zod.gen', () => {
  const schema: {
    safeParse: () => unknown;
    extend?: () => unknown;
    superRefine?: () => unknown;
  } = {
    safeParse: () => ({ success: true, data: {} }),
  };
  schema.extend = () => schema;
  schema.superRefine = () => schema;

  return {
    zEntitlementWritable: {
      pick: () => schema,
      shape: {
        name: { min: () => ({}) },
      },
    },
  };
});

// Mock form hook (complex abstraction with internal state)
vi.mock('@/hooks/form', () => ({
  createFormSubmitHandler: (handleSubmit: () => void) => () => handleSubmit(),
  useAppForm: () => ({
    handleSubmit: vi.fn(),
    setFieldValue: vi.fn(),
    AppForm: ({ children }: { children: ReactNode }) => (
      <div data-testid="app-form">{children}</div>
    ),
    AppField: ({ children, name }: { children: any; name: string }) => (
      <div data-testid={`field-${name}`}>
        {children({
          TextField: ({ label, ...props }: any) => (
            <div>
              <label>{label}</label>
              <input {...props} />
            </div>
          ),
          TextAreaField: ({ label, ...props }: any) => (
            <div>
              <label>{label}</label>
              <textarea {...props} />
            </div>
          ),
          SelectField: ({
            getOptionLabel,
            getOptionValue,
            label,
            options = [],
            ...props
          }: any) => (
            <div>
              <label>{label}</label>
              <select {...props}>
                {options.map((option: unknown) => (
                  <option
                    key={getOptionValue(option)}
                    value={getOptionValue(option)}
                  >
                    {getOptionLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          ),
        })}
      </div>
    ),
    Subscribe: ({ children, selector }: { children: any; selector: any }) => {
      // Defaults to a NUMBER meter on a lifetime counter, so the
      // aggregationMethod and reset-cadence fields render.
      return children(selector({ values: formState.values }));
    },
    SubmitButton: ({ label, ...props }: any) => (
      <button type="submit" {...props}>
        {label}
      </button>
    ),
  }),
}));

vi.mock('@/functionals/stacked-form-dialog', () => ({
  StackedFormDialogCard: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('@/functionals/step-stack', () => ({
  StepStack: ({ children }: { children: ReactNode }) => children,
  StepStackContainer: ({ children }: { children: ReactNode }) => children,
  StepStackPrevious: ({ children }: { children: ReactNode }) => children,
  StepStackStep: ({ children }: { children: ReactNode }) => children,
  useStepStack: () => ({
    activeIndex: 0,
    nextStep: vi.fn(),
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('EntitlementForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formState.values = { ...defaultFormValues };
  });

  describe('Create mode', () => {
    it('renders the form with create button when no entitlement is provided', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('app-form')).toBeInTheDocument();
      expect(screen.getByTestId('field-name')).toBeInTheDocument();
      expect(screen.getByTestId('field-description')).toBeInTheDocument();
      expect(screen.getByTestId('field-groupSlugs')).toBeInTheDocument();
      expect(screen.getByText('Créer')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('field-name')).toBeInTheDocument();
      expect(screen.getByTestId('field-description')).toBeInTheDocument();
      expect(
        screen.getByTestId('entitlement-group-selector'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('field-type')).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Config' }),
      ).toBeInTheDocument();
    });
  });

  describe('Edit mode', () => {
    it('renders the form with update button when entitlement is provided', () => {
      const mockEntitlement: Entitlement = {
        id: '1',
        name: 'Test Entitlement',
        description: 'Test Description',
        type: 'NUMBER',
        aggregationMethod: 'COUNT',
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      };

      render(<EntitlementForm entitlement={mockEntitlement} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('app-form')).toBeInTheDocument();
      expect(screen.getByText('Mettre à jour')).toBeInTheDocument();
    });

    it('collapses the dialog to a single step when editing a non-NUMBER entitlement', () => {
      const booleanEntitlement: Entitlement = {
        id: '1',
        name: 'AI features',
        description: 'Access to AI-powered features',
        type: 'BOOLEAN',
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      };

      render(
        <EntitlementForm layout="dialog" entitlement={booleanEntitlement} />,
        { wrapper: createWrapper() },
      );

      // No immutable type step: the type select is gone and the update button
      // sits on the single identity step (no "Next").
      expect(screen.getByText('Mettre à jour')).toBeInTheDocument();
      expect(screen.queryByTestId('field-type')).not.toBeInTheDocument();
      expect(screen.queryByText('Common.next')).not.toBeInTheDocument();
    });

    it('keeps the type step when editing a NUMBER entitlement', () => {
      const numberEntitlement: Entitlement = {
        id: '1',
        name: 'Seats',
        description: null,
        type: 'NUMBER',
        aggregationMethod: 'COUNT',
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      };

      render(
        <EntitlementForm layout="dialog" entitlement={numberEntitlement} />,
        { wrapper: createWrapper() },
      );

      expect(screen.getByTestId('field-type')).toBeInTheDocument();
    });
  });

  describe('User facing field', () => {
    it('renders the user facing switch in the identity step', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(
        screen.getByRole('switch', { name: 'Visible côté client' }),
      ).toBeInTheDocument();
    });

    it('renders the display order field in the identity step', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('field-displayOrder')).toBeInTheDocument();
      expect(screen.getByText("Ordre d'affichage")).toBeInTheDocument();
    });
  });

  describe('Unit fields', () => {
    it('renders the base unit inputs for NUMBER entitlements', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getByLabelText('Unité (singulier)')).toBeInTheDocument();
      expect(screen.getByLabelText('Unité (pluriel)')).toBeInTheDocument();
      expect(
        screen.getByRole('switch', {
          name: 'La fonctionnalité est vendue dans une unité différente',
        }),
      ).toBeInTheDocument();
    });

    it('hides the sale unit section until the toggle is enabled', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(
        screen.queryByLabelText('Unité de vente (singulier)'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Unités de base par unité de vente'),
      ).not.toBeInTheDocument();
    });

    it('reveals the sale unit section and the calculation row when toggled on', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      fireEvent.click(
        screen.getByRole('switch', {
          name: 'La fonctionnalité est vendue dans une unité différente',
        }),
      );

      expect(
        screen.getByLabelText('Unité de vente (singulier)'),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Unité de vente (pluriel)'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Une unité de vente')).toBeDisabled();
      expect(
        screen.getByLabelText('Unités de base par unité de vente'),
      ).toBeInTheDocument();
    });

    it('starts with the sale unit section open when the entitlement has sale units', () => {
      const entitlementWithUnits: Entitlement = {
        id: '1',
        name: 'Seats',
        description: null,
        type: 'NUMBER',
        aggregationMethod: 'SUM',
        unitSingular: 'seat',
        unitPlural: 'seats',
        saleUnitSingular: 'pack',
        saleUnitPlural: 'packs',
        saleUnitFactor: 3,
        createdAt: '2026-03-01T09:00:00.000Z',
        updatedAt: '2026-03-01T09:00:00.000Z',
      };

      render(<EntitlementForm entitlement={entitlementWithUnits} />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByRole('switch', {
          name: 'La fonctionnalité est vendue dans une unité différente',
        }),
      ).toBeChecked();
      expect(
        screen.getByLabelText('Unité de vente (singulier)'),
      ).toBeInTheDocument();
    });
  });

  describe('Reset period fields', () => {
    const periodicEntitlement: Entitlement = {
      id: '1',
      name: 'API calls',
      description: null,
      type: 'NUMBER',
      aggregationMethod: 'SUM',
      resetPeriod: 'MONTH',
      resetAnchor: 'CALENDAR',
      createdAt: '2026-03-01T09:00:00.000Z',
      updatedAt: '2026-03-01T09:00:00.000Z',
    };
    const lifetimeEntitlement: Entitlement = {
      ...periodicEntitlement,
      resetPeriod: undefined,
      resetAnchor: undefined,
    };

    const cadenceSelect = () =>
      within(screen.getByTestId('field-resetPeriod')).getByRole('combobox');

    it('offers a reset cadence on a NUMBER entitlement', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('field-resetPeriod')).toBeInTheDocument();
    });

    it('asks for the window alignment only once a cadence is picked', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('field-resetAnchor')).not.toBeInTheDocument();

      formState.values = { ...defaultFormValues, resetPeriod: 'MONTH' };
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.getAllByTestId('field-resetAnchor').length).toBeGreaterThan(
        0,
      );
    });

    // The one-way door: the API refuses to change or remove a stored period,
    // so the form must stop offering it for edit.
    it('locks the cadence once the entitlement already has one', () => {
      formState.values = { ...defaultFormValues, resetPeriod: 'MONTH' };
      render(<EntitlementForm entitlement={periodicEntitlement} />, {
        wrapper: createWrapper(),
      });

      expect(cadenceSelect()).toBeDisabled();
      expect(
        within(screen.getByTestId('field-resetAnchor')).getByRole('combobox'),
      ).toBeDisabled();
    });

    // An entitlement created before this feature has no period yet and must
    // still be able to adopt one exactly once.
    it('leaves the cadence editable on a stored lifetime entitlement', () => {
      render(<EntitlementForm entitlement={lifetimeEntitlement} />, {
        wrapper: createWrapper(),
      });

      expect(cadenceSelect()).not.toBeDisabled();
    });

    it('replaces the fields with an explanation for the LATEST aggregation', () => {
      formState.values = {
        ...defaultFormValues,
        aggregationMethod: 'LATEST',
        resetPeriod: 'MONTH',
      };
      render(<EntitlementForm />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('field-resetPeriod')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-resetAnchor')).not.toBeInTheDocument();
      expect(
        screen.getByText(
          '« Dernier » ne peut pas être combiné à une remise à zéro périodique.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Form structure', () => {
    it('renders submit button', () => {
      render(<EntitlementForm />, { wrapper: createWrapper() });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has proper form element', () => {
      render(<EntitlementForm layout="dialog" />, { wrapper: createWrapper() });

      // The real form is wrapped by the component, app-form is from our mock
      expect(screen.getByTestId('app-form')).toBeInTheDocument();
      const form = document.querySelector('form');
      const submitButton = screen.getByRole('button', { name: 'Créer' });

      expect(form).toBeInTheDocument();
      expect(form?.id).toBeTruthy();
      expect(submitButton).toHaveAttribute('form', form?.id);
    });
  });
});
