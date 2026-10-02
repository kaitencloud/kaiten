import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Customer } from '@/api-client';
import { CustomerForm } from '../customer-form';

// Mock external dependencies only
const mockNavigate = vi.fn();
const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouteContext: () => ({ queryClient: mockQueryClient }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'Pages.Customers.Mutation.Form.Labels.name': 'Nom',
        'Pages.Customers.Mutation.Form.Labels.customId': 'ID client externe',
        'Pages.Customers.Mutation.Form.Placeholders.name':
          'Entrez le nom du client',
        'Pages.Customers.Mutation.Form.Placeholders.customId':
          "Entrez l'ID client externe",
        'Pages.Customers.Mutation.Form.Descriptions.name': 'Le nom du client',
        'Pages.Customers.Mutation.Form.Descriptions.customId':
          "L'identifiant externe du client",
        'Pages.Customers.Mutation.Form.Labels.domain': 'Domaine',
        'Pages.Customers.Mutation.Form.Placeholders.domain': 'acme.com',
        'Pages.Customers.Mutation.Form.Descriptions.domain':
          'Le domaine principal du client',
        'Pages.Customers.Mutation.Form.Labels.slug': 'Slug',
        'Pages.Customers.Mutation.Form.Placeholders.slug': 'acme-inc',
        'Pages.Customers.Mutation.Form.Descriptions.slug':
          'Identifiant optionnel. Laissez vide pour le générer automatiquement.',
        'Pages.Customers.Mutation.Form.createButton': 'Créer le client',
        'Pages.Customers.Mutation.Form.updateButton': 'Mettre à jour le client',
        'Pages.Customers.Mutation.Form.Errors.name': 'Le nom est requis',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock form hook (complex abstraction with internal state)
vi.mock('@/hooks/form', () => ({
  createFormSubmitHandler: (handleSubmit: () => void) => () => handleSubmit(),
  useAppForm: () => ({
    handleSubmit: vi.fn(),
    AppForm: ({ children }: { children: React.ReactNode }) => (
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
        })}
      </div>
    ),
    SubmitButton: ({ label, ...props }: any) => (
      <button type="submit" {...props}>
        {label}
      </button>
    ),
  }),
}));

vi.mock('@/functionals/stacked-form-dialog', () => ({
  StackedFormDialogFooter: ({ children }: { children: React.ReactNode }) =>
    children,
  StackedFormDialogPanel: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('CustomerForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('renders form for creating a new customer', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('app-form')).toBeInTheDocument();
      expect(document.querySelector('form')).toBeInTheDocument();
    });

    it('renders form fields', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('field-name')).toBeInTheDocument();
      expect(
        screen.getByTestId('field-externalCustomerId'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('field-domain')).toBeInTheDocument();
    });

    it('renders field labels', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      expect(screen.getByText('Nom')).toBeInTheDocument();
      expect(screen.getByText('ID client externe')).toBeInTheDocument();
      expect(screen.getByText('Domaine')).toBeInTheDocument();
      expect(screen.getByText('Slug')).toBeInTheDocument();
    });

    it('renders text inputs', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(4);
    });
  });

  describe('Edit mode', () => {
    const existingCustomer: Customer = {
      id: '1',
      name: 'Existing Customer',
      externalCustomerId: 'EXISTING123',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      createdBy: { id: 'user1', name: 'User 1' },
      updatedBy: { id: 'user1', name: 'User 1' },
    };

    it('renders form with customer data for editing', () => {
      render(<CustomerForm customer={existingCustomer} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('app-form')).toBeInTheDocument();
    });
  });

  describe('Form structure', () => {
    it('renders submit button', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has proper form element', () => {
      render(<CustomerForm />, { wrapper: createWrapper() });

      expect(screen.getByTestId('app-form')).toBeInTheDocument();
      const form = document.querySelector('form');
      const submitButton = screen.getByRole('button', {
        name: 'Créer le client',
      });

      expect(form).toBeInTheDocument();
      expect(form?.id).toBeTruthy();
      expect(submitButton).toHaveAttribute('form', form?.id);
    });
  });
});
