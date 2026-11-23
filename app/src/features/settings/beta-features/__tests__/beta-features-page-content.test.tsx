import { OpenFeature } from '@openfeature/web-sdk';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { testI18n } from '@/__tests__/test-i18n';
import { betaFeaturesHandlers } from '@/e2e/msw/beta-features-handlers';
import {
  betaFeaturesFlagQueryOptions,
  refreshPlatformFlags,
} from '@/lib/feature-flags';
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

// No flag below is named anywhere in the console: the page lists them because
// the bulk evaluation answers them, as the service answers every flag it holds.
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

function install(
  flags: MockedBetaFlag[],
  flagEvaluations: Record<string, boolean> = {},
) {
  const model = new BetaFeaturesAppModel(flags);
  const evaluations = vi.spyOn(model, 'evaluations');
  server.use(...betaFeaturesHandlers(model, flagEvaluations));
  return { model, evaluations };
}

const listedSlugs = async () =>
  (await screen.findAllByTestId('beta-feature')).map(
    (row) => row.dataset.slug,
  );

/** A gate on the same page: it reads its flag through the provider. */
function GateProbe() {
  const { data } = useQuery(betaFeaturesFlagQueryOptions);
  return <p data-testid="gate">{String(data)}</p>;
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

  it('lists every public and open beta the evaluation answers, by slug, and no other flag', async () => {
    install(
      [
        { flagSlug: 'zeta-reports', stage: 'open_beta', enabled: true },
        SMART_SEARCH,
        { flagSlug: 'early-access', stage: 'private_beta', enabled: true },
        { flagSlug: 'released-export', enabled: true },
        {
          flagSlug: 'broken-beta',
          stage: 'public_beta',
          enabled: true,
          errorCode: 'PARSE_ERROR',
        },
        { flagSlug: 'alpha-insights', stage: 'public_beta', enabled: false },
      ],
      // A gate's flag answered in the same evaluation, with no stage.
      { 'beta-features': true },
    );
    renderWithClient(<BetaFeaturesPageContent />);

    expect(await listedSlugs()).toEqual([
      'alpha-insights',
      'smart-search',
      'zeta-reports',
    ]);
  });

  it('names a beta from its flag metadata until its translations ship, the translation first', async () => {
    install([
      {
        flagSlug: 'order-forecast',
        stage: 'public_beta',
        enabled: false,
        title: 'Order forecast',
        description: 'Forecasts the next orders of each customer.',
      },
      {
        flagSlug: 'bulk-import',
        stage: 'open_beta',
        enabled: false,
        title: 'Bulk import',
      },
      {
        ...SMART_SEARCH,
        title: 'Title written on the flag',
        description: 'Description written on the flag',
      },
    ]);
    renderWithClient(<BetaFeaturesPageContent />);

    const forecast = await betaRow('order-forecast');
    expect(within(forecast).getByText('Order forecast')).toBeTruthy();
    expect(
      within(forecast).getByText('Forecasts the next orders of each customer.'),
    ).toBeTruthy();
    expect(
      within(forecast).getByRole('switch', { name: 'Order forecast' }),
    ).toBeTruthy();

    const bulkImport = await betaRow('bulk-import');
    expect(within(bulkImport).getByText('Bulk import')).toBeTruthy();
    expect(
      within(bulkImport).getByText('No description for this beta yet.'),
    ).toBeTruthy();

    const smartSearch = await betaRow('smart-search');
    expect(within(smartSearch).getByText('Smart search')).toBeTruthy();
    expect(
      within(smartSearch).getByText('Search that reads what you mean.'),
    ).toBeTruthy();
    expect(
      within(smartSearch).queryByText('Title written on the flag'),
    ).toBeNull();
  });

  it('names a refused beta by its metadata title', async () => {
    const { model } = install([
      {
        flagSlug: 'order-forecast',
        stage: 'public_beta',
        enabled: false,
        title: 'Order forecast',
      },
    ]);
    model.refuseNext('notAccepted');
    renderWithClient(<BetaFeaturesPageContent />);

    await userEvent.click(
      within(await betaRow('order-forecast')).getByRole('switch'),
    );

    const alert = await screen.findByTestId('beta-feature-problem');
    expect(within(alert).getByText('Order forecast was not changed')).toBeTruthy();
  });

  it('reads the evaluation again after a toggle, and drops the provider memo the gates read', async () => {
    const { evaluations } = install([SMART_SEARCH], { 'beta-features': true });
    renderWithClient(
      <>
        <GateProbe />
        <BetaFeaturesPageContent />
      </>,
    );

    await betaRow('smart-search');
    await vi.waitFor(() =>
      expect(screen.getByTestId('gate').textContent).toBe('true'),
    );
    // One bulk read for the page, one for the provider behind the gate.
    expect(evaluations).toHaveBeenCalledTimes(2);

    await userEvent.click(
      within(await betaRow('smart-search')).getByRole('switch'),
    );
    await vi.waitFor(async () =>
      expect((await betaRow('smart-search')).dataset.enabled).toBe('true'),
    );
    // Both again: the page's read, and the provider set up anew for the gate.
    await vi.waitFor(() => expect(evaluations).toHaveBeenCalledTimes(4));
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

  it('turns a boolean beta the console does not name on, then off, and reads the flags again after each', async () => {
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

  const FAILED_READS: Array<[string, () => Response]> = [
    ['a 500', () => HttpResponse.json({ errorCode: 'GENERAL' }, { status: 500 })],
    ['a 401', () => new HttpResponse(null, { status: 401 })],
    ['a 403', () => new HttpResponse(null, { status: 403 })],
    [
      'a 429',
      () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '1' } }),
    ],
    ['a 304', () => new HttpResponse(null, { status: 304 })],
    ['a 200 with no flags', () => HttpResponse.json({ errorCode: 'GENERAL' })],
    ['a network failure', () => HttpResponse.error()],
  ];

  it.each(FAILED_READS)(
    'says the flags could not be read after %s, and reads them again on request',
    async (_, failure) => {
      let calls = 0;
      install([SMART_SEARCH]);
      // In front of the model's evaluation: the first read fails, the next ones
      // fall through to it.
      server.use(
        http.post('*/api/ofrep/v1/evaluate/flags', () => {
          calls += 1;
          return calls === 1 ? failure() : undefined;
        }),
      );
      renderWithClient(<BetaFeaturesPageContent />);

      const error = await screen.findByTestId('beta-features-load-error');
      expect(screen.queryByTestId('beta-features-empty')).toBeNull();
      await userEvent.click(within(error).getByRole('button', { name: 'Try again' }));

      expect(await betaRow('smart-search')).toBeTruthy();
    },
  );
});
