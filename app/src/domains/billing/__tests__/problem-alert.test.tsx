import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { ApiError } from '@/lib/errors';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { MissingScopeBanner, ProblemAlert } from '../components';

// The unit i18n returns a key for a text it was not given. These tests read the
// real English and French, as the user does.
beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalZone;
  }
});

// Intl separates a day from the marker with a no-break space in some locales.
const plain = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

const apiError = (status: number, data: unknown) => new ApiError({ data, status });

describe('ProblemAlert', () => {
  it('shows the detail of the problem as the API wrote it', () => {
    render(
      <ProblemAlert
        error={apiError(422, {
          code: 'SubscribeInstance.StartAtTooEarly',
          detail: 'startAt must be on or after 2027-02-01T10:00:00Z',
          status: 422,
        })}
      />,
    );

    expect(
      screen.getByText('startAt must be on or after 2027-02-01T10:00:00Z'),
    ).toBeInTheDocument();
    // The code explains nothing a detail does not: it is not shown beside it.
    expect(screen.queryByText('SubscribeInstance.StartAtTooEarly')).toBeNull();
  });

  it('falls back to a generic message and the code in a monospace hint when it has no detail', () => {
    render(
      <ProblemAlert
        error={apiError(422, { code: 'SubscribeInstance.StartAtTooEarly', status: 422 })}
      />,
    );

    expect(
      screen.getByText('Something went wrong while talking to billing.'),
    ).toBeInTheDocument();
    const code = screen.getByText('SubscribeInstance.StartAtTooEarly');
    expect(code.tagName).toBe('CODE');
    expect(code).toHaveClass('font-mono');
  });

  it('shows the trace id of a server error beside its detail', () => {
    render(
      <ProblemAlert
        error={apiError(500, { detail: 'internal error', errorId: 'trace-42', status: 500 })}
      />,
    );

    expect(screen.getByText('internal error')).toBeInTheDocument();
    expect(screen.getByText('Reference trace-42')).toBeInTheDocument();
  });

  it('says nothing was changed on a 503 and offers a retry, which asks again', async () => {
    const onRetry = vi.fn();
    render(
      <ProblemAlert
        error={apiError(503, {
          code: 'Billing.EntitlementCheckUnavailable',
          detail: 'The billing entitlement could not be checked',
          status: 503,
        })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Nothing was changed. You can try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says it is the provider that is unreachable when it is', () => {
    render(
      <ProblemAlert
        error={apiError(503, { code: 'SyncInvoice.ProviderUnavailable', status: 503 })}
      />,
    );

    expect(
      screen.getByText('The payment provider could not be reached. Nothing was changed.'),
    ).toBeInTheDocument();
  });

  it('offers no retry for a refusal that asking again will not change', () => {
    render(
      <ProblemAlert
        error={apiError(409, { code: 'MarkInvoicePaid.InvalidStatus', detail: 'x', status: 409 })}
        onRetry={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('names the missing scope for a 403, in a banner', () => {
    render(
      <ProblemAlert
        error={apiError(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: write:billing',
          status: 403,
        })}
      />,
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('data-kind', 'missing-scope');
    expect(within(banner).getByText('write:billing')).toBeInTheDocument();
  });

  it.each(['America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
    'says where the usage that is kept begins, in UTC whatever the zone of the browser (%s)',
    (zone) => {
      process.env.TZ = zone;
      render(
        <ProblemAlert
          error={apiError(422, {
            code: 'ListUsageReports.OutsideRetention',
            detail: 'the range starts before the retention window',
            errors: [
              {
                location: 'query.from',
                value: { retentionStart: '2026-11-01T00:00:00Z' },
              },
            ],
            status: 422,
          })}
        />,
      );

      // The first of November, even where it is still the thirty-first.
      expect(
        plain(screen.getByText(/^Usage before .* is no longer kept\.$/).textContent),
      ).toBe('Usage before Nov 1, 2026 (UTC) is no longer kept.');
    },
  );

  it('shows a failure that is not a problem document by its message', () => {
    render(<ProblemAlert error={new Error('Failed to fetch')} />);

    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });
});

describe('MissingScopeBanner', () => {
  it('names the scope, and where to add it', () => {
    render(<MissingScopeBanner scope="read:billing" />);

    expect(screen.getByText('Missing access')).toBeInTheDocument();
    expect(screen.getByText('read:billing')).toBeInTheDocument();
    expect(screen.getByText(/token template of your identity provider/)).toBeInTheDocument();
  });

  it('says so when the API did not name a scope', () => {
    render(<MissingScopeBanner />);

    expect(screen.getByText('a scope this action requires')).toBeInTheDocument();
  });
});
