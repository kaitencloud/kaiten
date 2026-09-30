import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RouteError } from '../route-error';

const mockNavigate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: mockInvalidate, navigate: mockNavigate }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: '/customers/does-not-exist' } }),
}));

const translations: Record<string, string> = {
  'Errors.api.NETWORK':
    'Unable to connect to the server. Please check your connection.',
  'Errors.api.SERVER_ERROR':
    'The server encountered an error. Please try again later.',
  'Errors.backTo': 'Back to {{section}}',
  'Errors.goHome': 'Go Home',
  'Errors.restricted': 'Restricted access',
  'Errors.restrictedDescription': "You don't have access to this page.",
  'Pages.Customers.title': 'Customers',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, string>) => {
      if (typeof options === 'string') {
        return options;
      }

      const template = translations[key] ?? options?.defaultValue ?? key;
      return template.replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => options?.[name] ?? '',
      );
    },
  }),
}));

// The problem the API answers a session that lacks a scope.
const missingScope = {
  title: 'Forbidden',
  status: 403,
  detail: 'missing required scope: read:customers',
  instance: '/api/customers',
  code: 'Auth.MissingScope',
};

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a 404 from the API into a way back to the section', () => {
    render(<RouteError error={new ApiError({ status: 404, data: null })} />);

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Customers' }),
    ).toHaveAttribute('href', '/customers');
    expect(
      screen.queryByRole('button', { name: 'Try Again' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the retry for any other failure', () => {
    render(<RouteError error={new ApiError({ status: 500, data: null })} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try Again' }),
    ).toBeInTheDocument();
  });

  describe('message', () => {
    // The message of an ApiError only names the status: what the API said is
    // in the problem it answered.
    it('shows the detail of the problem the API answered', () => {
      render(
        <RouteError
          error={
            new ApiError({
              status: 409,
              data: { title: 'Conflict', detail: 'Slug already exists' },
            })
          }
        />,
      );

      // The stack printed in development still names the ApiError: only the
      // alert is what the page says.
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Slug already exists');
      expect(alert).not.toHaveTextContent('Request failed with status 409');
    });

    it('falls back to the title of a problem that has no detail', () => {
      render(
        <RouteError
          error={new ApiError({ status: 409, data: { title: 'Conflict' } })}
        />,
      );

      expect(screen.getByText('Conflict')).toBeInTheDocument();
    });

    // An error response without a body reaches the REST client's interceptor
    // as an empty string.
    it('falls back to the localized message of the status for an empty body', () => {
      render(<RouteError error={new ApiError({ status: 500, data: '' })} />);

      expect(
        screen.getByText(
          'The server encountered an error. Please try again later.',
        ),
      ).toBeInTheDocument();
    });

    // A body that is not a problem was not written by the API: it is the text
    // or the page of a gateway, which is not a message for the user.
    it('does not print a body that is not a problem', () => {
      render(
        <RouteError
          error={
            new ApiError({
              status: 502,
              data: '<html><head><title>502 Bad Gateway</title></head></html>',
            })
          }
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        'The server encountered an error. Please try again later.',
      );
      expect(alert).not.toHaveTextContent('Bad Gateway');
    });

    it('says the server cannot be reached when the request got no response', () => {
      render(
        <RouteError
          error={new ApiError({ data: new TypeError('Failed to fetch') })}
        />,
      );

      expect(
        screen.getByText(
          'Unable to connect to the server. Please check your connection.',
        ),
      ).toBeInTheDocument();
    });

    it('keeps the message of an error that is not an ApiError', () => {
      render(<RouteError error={new Error('No data returned from GraphQL')} />);

      expect(
        screen.getByText('No data returned from GraphQL'),
      ).toBeInTheDocument();
    });

    it('shows a thrown string as is', () => {
      render(<RouteError error="the loader gave up" />);

      expect(screen.getByText('the loader gave up')).toBeInTheDocument();
    });

    it('says the error is unknown when the thrown value does not describe it', () => {
      render(<RouteError error={{ reason: 'not an error' }} />);

      expect(screen.getByText('An unknown error occurred')).toBeInTheDocument();
    });

    // `getApiErrorMessage` and `handleApiError` log on every call, which a
    // render must not do.
    it('reads the message without logging', () => {
      const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});

      const { rerender } = render(
        <RouteError
          error={
            new ApiError({
              status: 409,
              data: { title: 'Conflict', detail: 'Slug already exists' },
            })
          }
        />,
      );
      rerender(<RouteError error={new Error('boom')} />);

      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe('a read the API refuses', () => {
    it('shows restricted access with the reason of the API, and no retry', () => {
      render(
        <RouteError
          error={new ApiError({ status: 403, data: missingScope })}
        />,
      );

      expect(screen.getByText('Restricted access')).toBeInTheDocument();
      expect(
        screen.getByText("You don't have access to this page."),
      ).toBeInTheDocument();
      expect(
        screen.getByText('missing required scope: read:customers'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
        'href',
        '/',
      );
      expect(
        screen.queryByText('Something went wrong'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Try Again' }),
      ).not.toBeInTheDocument();
    });

    // The title of a refusal is the name of the status, which the restricted
    // state says already.
    it('leaves the reason out when the problem has no detail', () => {
      render(
        <RouteError
          error={
            new ApiError({
              status: 403,
              data: { title: 'Forbidden', status: 403 },
            })
          }
        />,
      );

      expect(screen.getByText('Restricted access')).toBeInTheDocument();
      expect(screen.queryByText('Forbidden')).not.toBeInTheDocument();
    });

    it('shows restricted access for a refusal that carries no problem', () => {
      render(<RouteError error={new ApiError({ status: 403, data: null })} />);

      expect(screen.getByText('Restricted access')).toBeInTheDocument();
      expect(
        screen.getByText("You don't have access to this page."),
      ).toBeInTheDocument();
    });

    // Only a 403 the API answered is a refusal: an error that merely names the
    // status in its message stays an error.
    it('keeps the error card for an error that is not an ApiError', () => {
      render(
        <RouteError
          error={new Error('GraphQL request failed with status 403')}
        />,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('GraphQL request failed with status 403'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Restricted access')).not.toBeInTheDocument();
    });
  });
});
