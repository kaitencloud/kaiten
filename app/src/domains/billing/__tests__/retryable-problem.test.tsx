import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { ApiError } from '@/lib/errors';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { BillingRouteError, ProblemAlert, RetryableProblem } from '../components';

const invalidate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: '/invoices/inv-1' } }),
}));

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const apiError = (status: number, data: unknown) => new ApiError({ data, status });

describe('RetryableProblem', () => {
  it('shows the refusal as the API wrote it, and reads again when asked', async () => {
    const onRetry = vi.fn();
    render(
      <RetryableProblem
        data-testid="problem"
        error={apiError(500, {
          detail: 'the invoice store is unavailable',
          errorId: 'trace-77',
          status: 500,
        })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('problem')).toBeInTheDocument();
    expect(screen.getByText('the invoice store is unavailable')).toBeInTheDocument();
    expect(screen.getByText('Reference trace-77')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry for a period whose usage is no longer kept: asking again changes nothing', () => {
    render(
      <RetryableProblem
        error={apiError(422, {
          code: 'GetUpcomingInvoice.OutsideRetention',
          detail: 'the usage of this period is no longer kept',
          status: 422,
        })}
        onRetry={() => {}}
      />,
    );

    expect(
      screen.getByText('the usage of this period is no longer kept'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('offers no retry to a session that lacks the scope: asking again changes nothing', () => {
    render(
      <RetryableProblem
        error={apiError(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: read:billing',
          status: 403,
        })}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText('read:billing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('the title of a read that failed', () => {
  it.each([500, 502, 503])(
    'does not say a %s was refused: the server could not answer, nobody refused',
    (status) => {
      render(
        <RetryableProblem
          error={apiError(status, { detail: 'boom', status })}
          onRetry={() => {}}
        />,
      );

      expect(screen.getByText('The data could not be read')).toBeInTheDocument();
      expect(screen.queryByText('The request was refused')).toBeNull();
    },
  );

  it('says it for a failure that got no answer at all', () => {
    render(<RetryableProblem error={new Error('Failed to fetch')} onRetry={() => {}} />);

    expect(screen.getByText('The data could not be read')).toBeInTheDocument();
  });

  it.each([403, 422])('keeps "refused" for a %s, which the API did refuse', (status) => {
    render(
      <RetryableProblem
        error={apiError(status, { detail: 'no', status })}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText('The request was refused')).toBeInTheDocument();
  });

  it('keeps "refused" for a call that is not a read, whatever the status', () => {
    render(<ProblemAlert error={apiError(500, { detail: 'boom', status: 500 })} />);

    expect(screen.getByText('The request was refused')).toBeInTheDocument();
  });
});

describe('BillingRouteError', () => {
  it('reads a record the API does not know as a page that does not exist', () => {
    render(<BillingRouteError error={apiError(404, { code: 'GetInvoice.NotFound', status: 404 })} />);

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.queryByTestId('billing-route-error')).toBeNull();
  });

  it('shows why the invoice could not be read, around the console that still works', () => {
    render(
      <BillingRouteError
        error={apiError(503, { detail: 'try again in a moment', status: 503 })}
      />,
    );

    expect(screen.getByTestId('billing-route-error')).toBeInTheDocument();
    expect(screen.getByText('try again in a moment')).toBeInTheDocument();
  });

  it('asks the router to run the loaders of the route again, which also resets its error boundaries', async () => {
    invalidate.mockClear();
    render(<BillingRouteError error={apiError(500, { detail: 'boom', status: 500 })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
