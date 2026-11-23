import { OpenFeature } from '@openfeature/web-sdk';
import { QueryClient } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { testI18n } from '@/__tests__/test-i18n';
import { betaFeaturesHandlers } from '@/e2e/msw/beta-features-handlers';
import { refreshPlatformFlags } from '@/lib/feature-flags';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  type BetaFeatureRefusal,
  BetaFeaturesAppModel,
  type MockedBetaFlag,
} from '../../../../../e2e/app/_support/model/beta-features-app-model';
import { BetaFeaturesPageContent } from '../components';

const { getAuthToken } = vi.hoisted(() => ({
  getAuthToken: vi.fn<() => Promise<string | undefined>>(),
}));
vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

// Where the platform flags are evaluated: the mocked OFREP endpoint, for one
// organization. The real provider reads it, so a refresh is a second request.
vi.mock('@/lib/feature-flag-source', () => ({
  BYPASS_AUTH: false,
  MOCKED_API: false,
  localSource: async () => null,
  platformSource: async () => null,
  usesPlatform: () => true,
  resolveSource: async () => ({
    baseUrl: 'http://platform.test/api',
    headers: async () => [],
    context: { targetingKey: 'org-beta-page' },
  }),
}));

// The app declares no beta today, so the page is pointed at test flags of each
// type, read by the same provider as the app's own.
vi.mock('@/lib/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return {
    ...actual,
    platformFlagEvaluationsQueryOptions: {
      ...actual.platformFlagEvaluationsQueryOptions,
      queryFn: () =>
        actual.readPlatformFlags({
          'smart-search': 'boolean',
          'checkout-flow': 'string',
          'early-access': 'boolean',
        }),
    },
  };
});

const SMART_SEARCH: MockedBetaFlag = {
  flagSlug: 'smart-search',
  stage: 'public_beta',
  enabled: false,
};
const CHECKOUT_FLOW: MockedBetaFlag = {
  flagSlug: 'checkout-flow',
  stage: 'open_beta',
  enabled: true,
  betaVariant: 'v2',
  stableVariant: 'legacy',
};

const WRITER = sessionToken(['read:beta_features', 'write:beta_features']);
const READER = sessionToken(['read:beta_features', 'read:instances']);

function install(flags: MockedBetaFlag[]) {
  const model = new BetaFeaturesAppModel(flags);
  const evaluations = vi.spyOn(model, 'evaluations');
  server.use(...betaFeaturesHandlers(model, {}));
  return { model, evaluations };
}

const betaRow = async (slug: string) =>
  (await screen.findAllByTestId('beta-feature')).find(
    (row) => row.dataset.slug === slug,
  ) as HTMLElement;

describe('BetaFeaturesPageContent', () => {
  useBillingTexts();
  beforeAll(() => {
    testI18n.addResourceBundle(
      'en',
      'translation',
      {
        Pages: {
          Settings: {
            BetaFeatures: {
              betas: {
                'smart-search': {
                  title: 'Smart search',
                  description: 'Search that reads what you mean.',
                },
              },
            },
          },
        },
      },
      true,
      true,
    );
  });
  beforeEach(async () => {
    getAuthToken.mockResolvedValue(WRITER);
    await refreshPlatformFlags(new QueryClient());
  });
  afterEach(() => OpenFeature.clearProviders());

  it('shows an empty state when no flag is an open or public beta', async () => {
    install([
      { flagSlug: 'early-access', stage: 'private_beta', enabled: true },
    ]);
    renderWithClient(<BetaFeaturesPageContent />);

    expect(await screen.findByTestId('beta-features-empty')).toBeTruthy();
    expect(
      screen.getByText('No beta is open to your organization'),
    ).toBeTruthy();
    expect(screen.queryByTestId('beta-feature')).toBeNull();
  });

  it('says a change applies within a minute and that turning off deletes nothing', async () => {
    install([SMART_SEARCH]);
    renderWithClient(<BetaFeaturesPageContent />);

    await betaRow('smart-search');
    expect(
      screen.getByText(
        'A change applies to your whole organization within a minute.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Turning a beta off deletes nothing: turn it back on and you find everything as it was.',
      ),
    ).toBeTruthy();
  });

  it('turns a boolean beta on, then off, and reads the flags again after each', async () => {
    const { model, evaluations } = install([SMART_SEARCH]);
    renderWithClient(<BetaFeaturesPageContent />);

    const row = await betaRow('smart-search');
    expect(within(row).getByText('Smart search')).toBeTruthy();
    expect(within(row).getByText('Public beta')).toBeTruthy();
    const toggle = within(row).getByRole('switch', { name: 'Smart search' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(evaluations).toHaveBeenCalledTimes(1);

    await userEvent.click(toggle);
    await vi.waitFor(async () =>
      expect((await betaRow('smart-search')).dataset.enabled).toBe('true'),
    );
    expect(model.acceptedWrites).toEqual([
      { flagSlug: 'smart-search', enabled: true },
    ]);
    // The state is the evaluation read again, not the answer of the write.
    expect(evaluations).toHaveBeenCalledTimes(2);

    await userEvent.click(
      within(await betaRow('smart-search')).getByRole('switch'),
    );
    await vi.waitFor(async () =>
      expect((await betaRow('smart-search')).dataset.enabled).toBe('false'),
    );
    expect(model.acceptedWrites.at(-1)).toEqual({
      flagSlug: 'smart-search',
      enabled: false,
    });
    expect(evaluations).toHaveBeenCalledTimes(3);
  });

  it('reads a non-boolean beta through its betaVariant, and names a beta with no copy by its slug', async () => {
    install([CHECKOUT_FLOW]);
    renderWithClient(<BetaFeaturesPageContent />);

    const row = await betaRow('checkout-flow');
    expect(row.dataset.enabled).toBe('true');
    expect(within(row).getByText('checkout-flow')).toBeTruthy();
    expect(within(row).getByText('Open beta')).toBeTruthy();
    expect(
      within(row).getByText('No description for this beta yet.'),
    ).toBeTruthy();

    await userEvent.click(within(row).getByRole('switch'));
    await vi.waitFor(async () =>
      expect((await betaRow('checkout-flow')).dataset.enabled).toBe('false'),
    );
  });

  it('shows the state read-only, with the reason, to a member without the scope', async () => {
    getAuthToken.mockResolvedValue(READER);
    const { model } = install([SMART_SEARCH, CHECKOUT_FLOW]);
    renderWithClient(<BetaFeaturesPageContent />);

    const row = await betaRow('checkout-flow');
    await vi.waitFor(() =>
      expect(within(row).getByTestId('beta-feature-read-only')).toBeTruthy(),
    );
    expect(
      within(row).getByText(
        'Read-only: changing a beta needs the write:beta_features scope.',
      ),
    ).toBeTruthy();
    const toggle = within(row).getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.hasAttribute('data-disabled')).toBe(true);

    await userEvent.click(toggle);
    expect(model.acceptedWrites).toEqual([]);
  });

  const REFUSALS: Array<[BetaFeatureRefusal, string, string, boolean]> = [
    ['invalidBody', 'invalid-body', 'Smart search was not changed', false],
    ['missingScope', 'missing-scope', 'Smart search was not changed', false],
    ['notProvisioned', 'not-provisioned', 'Your organization is still being set up', true],
    ['notAccepted', 'not-accepted', 'Smart search was not changed', false],
    ['unavailable', 'unavailable', 'Smart search was not changed', true],
  ];

  it.each(REFUSALS)(
    'explains a %s refusal and leaves the beta as it was',
    async (refusal, problem, title, retryable) => {
      const { model } = install([SMART_SEARCH]);
      model.refuseNext(refusal);
      renderWithClient(<BetaFeaturesPageContent />);

      await userEvent.click(
        within(await betaRow('smart-search')).getByRole('switch'),
      );

      const alert = await screen.findByTestId('beta-feature-problem');
      expect(alert.dataset.problem).toBe(problem);
      expect(within(alert).getByText(title)).toBeTruthy();
      expect(
        within(alert).queryByRole('button', { name: 'Try again' }) !== null,
      ).toBe(retryable);
      expect((await betaRow('smart-search')).dataset.enabled).toBe('false');
      expect(model.acceptedWrites).toEqual([]);
    },
  );

  it('offers an unavailable toggle again, and the retry goes through', async () => {
    const { model } = install([SMART_SEARCH]);
    model.refuseNext('unavailable');
    renderWithClient(<BetaFeaturesPageContent />);

    await userEvent.click(
      within(await betaRow('smart-search')).getByRole('switch'),
    );
    const alert = await screen.findByTestId('beta-feature-problem');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    await vi.waitFor(async () =>
      expect((await betaRow('smart-search')).dataset.enabled).toBe('true'),
    );
    expect(screen.queryByTestId('beta-feature-problem')).toBeNull();
    expect(model.acceptedWrites).toEqual([
      { flagSlug: 'smart-search', enabled: true },
    ]);
  });

  it('reads the list again when the beta is no longer open, and the beta leaves it', async () => {
    const { model, evaluations } = install([SMART_SEARCH, CHECKOUT_FLOW]);
    renderWithClient(<BetaFeaturesPageContent />);

    const row = await betaRow('smart-search');
    model.closeBeta('smart-search');
    await userEvent.click(within(row).getByRole('switch'));

    const alert = await screen.findByTestId('beta-feature-problem');
    expect(alert.dataset.problem).toBe('not-toggleable');
    expect(within(alert).getByText('Smart search is no longer open')).toBeTruthy();
    await vi.waitFor(() =>
      expect(
        screen
          .getAllByTestId('beta-feature')
          .map((candidate) => candidate.dataset.slug),
      ).toEqual(['checkout-flow']),
    );
    expect(evaluations).toHaveBeenCalledTimes(2);
  });

  it('says the flags could not be read, and reads them again on request', async () => {
    let calls = 0;
    install([SMART_SEARCH]);
    // In front of the model's evaluation: the first read fails, the next ones
    // fall through to it.
    server.use(
      http.post('*/api/ofrep/v1/evaluate/flags', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ errorCode: 'GENERAL' }, { status: 500 })
          : undefined;
      }),
    );
    renderWithClient(<BetaFeaturesPageContent />);

    const error = await screen.findByTestId('beta-features-load-error');
    await userEvent.click(within(error).getByRole('button', { name: 'Try again' }));

    expect(await betaRow('smart-search')).toBeTruthy();
  });
});
