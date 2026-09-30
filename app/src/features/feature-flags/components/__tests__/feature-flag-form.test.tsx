import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeatureFlagForm } from '../feature-flag-form';

const {
  formStateMock,
  handleCancelMock,
  handleSubmitMock,
  setFieldMetaMock,
  validateFieldMock,
} = vi.hoisted(() => ({
  formStateMock: {
    isDirty: false,
    isSubmitting: false,
    isValid: false,
    isValidating: false,
    values: {
      default_variant: { type: 'basic', value: '' },
      description: null,
      enabled: true,
      event_name: '',
      metadata: {},
      name: '',
      slug: '',
      targetings: [],
      type: 'boolean',
      variants: null,
    },
  },
  handleCancelMock: vi.fn(),
  handleSubmitMock: vi.fn((event?: Event) => event?.preventDefault()),
  setFieldMetaMock: vi.fn(),
  validateFieldMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'Common.cancel': 'Cancel',
        'Pages.FeatureFlags.Mutation.Form.Buttons.back': 'Back',
        'Pages.FeatureFlags.Mutation.Form.Buttons.create':
          'Create Feature Flag',
        'Pages.FeatureFlags.Mutation.Form.Buttons.next': 'Next',
        'Pages.FeatureFlags.Mutation.Form.Buttons.update':
          'Update Feature Flag',
        'Pages.FeatureFlags.Mutation.Form.Steps.step1': 'Basic Information',
        'Pages.FeatureFlags.Mutation.Form.Steps.step2':
          'Variants Configuration',
        'Pages.FeatureFlags.Mutation.Form.Steps.step3': 'Default Variant',
        'Pages.FeatureFlags.Mutation.Form.Steps.step4': 'Targeting Rules',
        'Pages.FeatureFlags.Mutation.titleNew': 'New Feature Flag',
        'Pages.FeatureFlags.Mutation.titleUpdate': 'Edit Feature Flag',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.title':
          'You still need to fix the following before submitting:',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.stepTitle':
          'Complete this step before continuing:',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.noChangesCreate':
          'Fill in the form before creating the feature flag.',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.noChangesUpdate':
          'Make at least one change before updating the feature flag.',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.nameRequired':
          'Name is required.',
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.slugRequired':
          'Slug is required.',
        'Pages.FeatureFlags.Mutation.Form.Step2.Errors.atLeastOneVariant':
          'At least one variant is required',
        'Pages.FeatureFlags.Mutation.Form.Step3.Errors.defaultVariantRequired':
          'Please select a default variant from the list',
      };

      return translations[key] || key;
    },
  }),
}));

vi.mock('../../hooks/use-feature-flag-form', () => ({
  useFeatureFlagForm: () => ({
    dialog: {
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      onOpenChange: vi.fn(),
      open: false,
    },
    form: {
      AppForm: ({ children }: { children: ReactNode }) => (
        <div data-testid="app-form">{children}</div>
      ),
      Subscribe: ({
        children,
        selector,
      }: {
        children: (
          value: typeof formStateMock & { disabled: boolean },
        ) => ReactNode;
        selector: (state: typeof formStateMock) => typeof formStateMock & {
          disabled: boolean;
        };
      }) => <>{children(selector(formStateMock))}</>,
      SubmitButton: ({ label }: { label: string }) => (
        <button type="submit">{label}</button>
      ),
      handleSubmit: handleSubmitMock,
      setFieldMeta: setFieldMetaMock,
      validateField: validateFieldMock,
      state: {
        values: {
          ...formStateMock.values,
        },
      },
    },
    handleCancel: handleCancelMock,
  }),
}));

vi.mock('../feature-flag-form/general-form', () => ({
  GeneralForm: () => <div>Basic tab content</div>,
}));

vi.mock('../feature-flag-form/variants-form', () => ({
  VariantsForm: () => <div>Variants tab content</div>,
}));

vi.mock('../feature-flag-form/default-variant/default-variant-form', () => ({
  DefaultVariantForm: () => <div>Default variant tab content</div>,
}));

vi.mock('../feature-flag-form/targeting-form', () => ({
  TargetingForm: () => <div>Targeting tab content</div>,
}));

describe('FeatureFlagForm', () => {
  beforeEach(() => {
    formStateMock.isDirty = false;
    formStateMock.isSubmitting = false;
    formStateMock.isValid = false;
    formStateMock.isValidating = false;
    formStateMock.values = {
      default_variant: { type: 'basic', value: '' },
      description: null,
      enabled: true,
      event_name: '',
      metadata: {},
      name: '',
      slug: '',
      targetings: [],
      type: 'boolean',
      variants: null,
    };
    handleCancelMock.mockReset();
    handleSubmitMock.mockReset();
    setFieldMetaMock.mockReset();
    validateFieldMock.mockReset();
  });

  it('renders a guided stepper instead of free tabs in create mode', () => {
    render(
      <TooltipProvider>
        <FeatureFlagForm />
      </TooltipProvider>,
    );

    expect(screen.getByText('New Feature Flag')).toBeInTheDocument();
    // The first step content is shown, the others are not mounted yet.
    expect(screen.getByText('Basic tab content')).toBeInTheDocument();
    expect(screen.queryByText('Variants tab content')).not.toBeInTheDocument();

    // Steps are rendered as a stepper, not as freely navigable tabs.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Targeting Rules')).toBeInTheDocument();

    // Navigation is sequential and gated: Back is disabled on the first step
    // and the submit only appears on the last step.
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.queryByText('Create Feature Flag')).not.toBeInTheDocument();
  });

  it('disables Next until the current step is valid', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <FeatureFlagForm />
      </TooltipProvider>,
    );

    // The empty step 1 cannot be left: Next is disabled.
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    // The reasons are surfaced in a tooltip on the disabled button.
    await user.hover(nextButton.parentElement as HTMLElement);

    const [tooltip] = await screen.findAllByRole('tooltip');
    expect(
      within(tooltip).getByText('Complete this step before continuing:'),
    ).toBeInTheDocument();
    expect(within(tooltip).getByText('Name is required.')).toBeInTheDocument();
    expect(within(tooltip).getByText('Slug is required.')).toBeInTheDocument();
  });

  it('switches to edit copy and keeps free tab navigation when a feature flag is provided', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <FeatureFlagForm
          featureFlag={
            {
              id: 'flag-id',
              name: 'My flag',
              description: 'Description',
              slug: 'my-flag',
              enabled: true,
              type: 'boolean',
              variants: [],
              default_variant: { type: 'basic', value: '' },
              targetings: [],
              event_name: 'feature_flag.evaluated',
              metadata: {},
            } as any
          }
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('Edit Feature Flag')).toBeInTheDocument();
    expect(screen.getByText('Update Feature Flag')).toBeInTheDocument();

    await user.click(
      screen.getByRole('tab', { name: 'Variants Configuration' }),
    );
    expect(screen.getByText('Variants tab content')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Targeting Rules' }));
    expect(screen.getByText('Targeting tab content')).toBeInTheDocument();
  });

  it('shows disabled submit blockers in a tooltip', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <FeatureFlagForm
          featureFlag={
            {
              id: 'flag-id',
              name: 'My flag',
              slug: 'my-flag',
              enabled: true,
              type: 'boolean',
              variants: [],
              default_variant: { type: 'basic', value: '' },
              targetings: [],
              event_name: 'feature_flag.evaluated',
              metadata: {},
            } as any
          }
        />
      </TooltipProvider>,
    );

    const submitButton = screen.getByRole('button', {
      name: 'Update Feature Flag',
    });
    expect(submitButton).toBeDisabled();

    await user.hover(submitButton.parentElement as HTMLElement);

    const [tooltip] = await screen.findAllByRole('tooltip');

    expect(
      within(tooltip).getByText(
        'You still need to fix the following before submitting:',
      ),
    ).toBeInTheDocument();
    expect(within(tooltip).getByText('Name is required.')).toBeInTheDocument();
    expect(within(tooltip).getByText('Slug is required.')).toBeInTheDocument();
    expect(
      within(tooltip).getByText('At least one variant is required'),
    ).toBeInTheDocument();
    expect(
      within(tooltip).getByText(
        'Please select a default variant from the list',
      ),
    ).toBeInTheDocument();
  });
});
