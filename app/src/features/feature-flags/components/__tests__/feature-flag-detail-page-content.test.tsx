import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  FeatureFlagDetailEvaluationTab,
  FeatureFlagDetailPageContent,
} from '../feature-flag-detail-page-content';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    params,
    search,
    to,
  }: {
    children: ReactNode;
    className?: string;
    params?: unknown;
    search?: unknown;
    to: string;
  }) => (
    <a
      className={className}
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
      data-to={to}
    >
      {children}
    </a>
  ),
  useRouteContext: () => ({ queryClient: new QueryClient() }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => select({ location: { pathname: '/feature-flags/test/evaluation' } }),
}));

const renderWithClient = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );

vi.mock('../try-it-dialog', () => ({
  TryItDialog: ({
    onEvaluated,
  }: {
    onEvaluated: (payload: {
      context: Record<string, unknown>;
      result: { reason: string; value: unknown; variant: string };
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onEvaluated({
          context: { customerId: 'customer_1' },
          result: {
            reason: 'rule matched',
            value:
              'payload_with_a_very_long_value_to_validate_that_wrapping_keeps_the_layout_stable_1234567890',
            variant: 'on',
          },
        })
      }
    >
      Inject evaluation
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'en-US',
    },
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }
      return key;
    },
  }),
}));

describe('FeatureFlagDetailPageContent', () => {
  it('keeps evaluation table fixed layout and wrapping classes for large payloads', () => {
    renderWithClient(
      <FeatureFlagDetailPageContent
        featureFlag={
          {
            default_variant: { type: 'basic', value: 'on' },
            description: 'Feature flag description',
            enabled: true,
            event_name: 'user.created',
            metadata: { owner: 'team-platform' },
            name: 'My feature',
            slug: 'my-feature',
            targetings: [],
            type: 'BOOLEAN',
            variants: [
              { description: 'Enabled', name: 'on', value: true },
              { description: 'Disabled', name: 'off', value: false },
            ],
          } as any
        }
        featureFlagSlug="my-feature"
      >
        <FeatureFlagDetailEvaluationTab />
      </FeatureFlagDetailPageContent>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inject evaluation' }));

    const table = screen
      .getByRole('columnheader', {
        name: 'Pages.FeatureFlags.Detail.Evaluation.samples.columns.context',
      })
      .closest('table');

    expect(table).toHaveClass('table-fixed');

    const valueCell = screen
      .getByText(
        'payload_with_a_very_long_value_to_validate_that_wrapping_keeps_the_layout_stable_1234567890',
      )
      .closest('td');

    expect(valueCell).toHaveClass('break-all', 'whitespace-normal');
  });
});
