import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Instance, InstanceBilling } from '@/api-client';
import {
  handleDeprecateLicensePrice,
  handleGetInstanceBilling,
  handleGetInstances,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import { buildSubscription } from '../../../../../e2e/app/_support/fixtures/build-subscription';
import { DeprecatePriceDialog } from '../prices/deprecate-price-dialog';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { params?: unknown; to: string }) => (
    <a {...props} data-params={JSON.stringify(params)} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

const PRICE = buildPrice({
  displayLabel: 'Business, monthly',
  id: 'price-business-monthly',
  unitAmountDecimal: '14900',
});
const OTHER = buildPrice({
  displayLabel: 'Starter, monthly',
  id: 'price-starter-monthly',
  unitAmountDecimal: '900',
});

const instance = (slug: string, name: string) => ({ id: `id-${slug}`, name, slug }) as Instance;

const INSTANCES = [
  instance('globex-production', 'Globex Production'),
  instance('acme-staging', 'Acme Staging'),
  instance('initech-prod', 'Initech Production'),
  instance('hooli-dev', 'Hooli Dev'),
  instance('never-billed', 'Never Billed'),
];

/** The subscription of each instance, or none: only some move to the price. */
const SUBSCRIPTIONS: Record<string, InstanceBilling | null> = {
  'acme-staging': buildSubscription({
    anchorAt: '2026-08-01T00:00:00.000Z',
    customerName: 'Acme',
    instanceName: 'Acme Staging',
    instanceSlug: 'acme-staging',
    scheduledChange: {
      effectiveAt: '2026-11-01T00:00:00.000Z',
      price: PRICE,
      scheduledAt: '2026-10-01T00:00:00.000Z',
    },
  }),
  'globex-production': buildSubscription({
    anchorAt: '2026-08-01T00:00:00.000Z',
    customerName: 'Globex',
    instanceName: 'Globex Production',
    instanceSlug: 'globex-production',
    scheduledChange: {
      effectiveAt: '2026-10-27T00:00:00.000Z',
      price: PRICE,
      scheduledAt: '2026-10-01T00:00:00.000Z',
    },
  }),
  'hooli-dev': buildSubscription({
    anchorAt: '2026-08-01T00:00:00.000Z',
    customerName: 'Hooli',
    instanceName: 'Hooli Dev',
    instanceSlug: 'hooli-dev',
    scheduledChange: {
      effectiveAt: '2026-11-01T00:00:00.000Z',
      price: OTHER,
      scheduledAt: '2026-10-01T00:00:00.000Z',
    },
  }),
  'initech-prod': buildSubscription({
    anchorAt: '2026-08-01T00:00:00.000Z',
    instanceSlug: 'initech-prod',
  }),
  'never-billed': null,
};

const PLAN_CHANGE_TARGET = {
  code: 'DeprecateLicensePrice.PlanChangeTarget',
  detail: 'a plan change is scheduled to this price: cancel it first',
} as const;

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'write:licenses', 'read:licenses', 'read:instances']),
  );
  server.use(
    handleGetInstances({ body: pageOf(INSTANCES) }),
    handleGetInstanceBilling(({ params }) => {
      const found = SUBSCRIPTIONS[String(params.instanceSlug)];

      return found
        ? HttpResponse.json(found)
        : refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' });
    }),
  );
});

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(
    <DeprecatePriceDialog
      entitlementBySlug={new Map()}
      licenseSlug="business-v3"
      onClose={onClose}
      price={PRICE}
    />,
  );

  return { onClose };
};

const confirm = () => screen.findByRole('button', { name: 'Deprecate' });

describe('deprecating a price', () => {
  it('asks first, and closes when the API accepts', async () => {
    server.use(handleDeprecateLicensePrice(() => new HttpResponse(null, { status: 204 })));
    const { onClose } = renderDialog();

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Deprecate “Business, monthly”?');
    await userEvent.click(await confirm());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows another refusal as the API wrote it, and looks for no instance', async () => {
    let looked = 0;
    server.use(
      handleDeprecateLicensePrice(() =>
        refusal(409, { code: 'DeprecateLicensePrice.LastDefault', detail: 'it is the last default price' }),
      ),
      handleGetInstances(() => {
        looked += 1;

        return HttpResponse.json(pageOf([]));
      }),
    );
    const { onClose } = renderDialog();

    await userEvent.click(await confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('it is the last default price');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('plan-change-instances')).toBeNull();
    expect(looked).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('when a plan change is scheduled to the price', () => {
    beforeEach(() => {
      server.use(
        handleDeprecateLicensePrice(() => refusal(409, PLAN_CHANGE_TARGET)),
      );
    });

    it('says what the API said, as it wrote it, and keeps the dialog open', async () => {
      const { onClose } = renderDialog();

      await userEvent.click(await confirm());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'a plan change is scheduled to this price: cancel it first',
      );
      expect(onClose).not.toHaveBeenCalled();
    });

    it('lists the instances that move to the price, each with the way to its Billing tab', async () => {
      renderDialog();

      await userEvent.click(await confirm());

      const list = await screen.findByTestId('plan-change-instances');
      expect(list).toHaveTextContent('These instances are scheduled to move to this price.');
      const links = within(list).getAllByRole('link');
      // By name, and not the instances that move elsewhere, stay, or were never billed.
      expect(links.map((link) => link.textContent)).toEqual(['Acme Staging', 'Globex Production']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/customers/instances/$instanceSlug/billing',
        '/customers/instances/$instanceSlug/billing',
      ]);
      expect(links.map((link) => link.getAttribute('data-params'))).toEqual([
        '{"instanceSlug":"acme-staging"}',
        '{"instanceSlug":"globex-production"}',
      ]);
      expect(list).toHaveTextContent('(Acme, from Nov 1, 2026 (UTC))');
      expect(list).toHaveTextContent('(Globex, from Oct 27, 2026 (UTC))');
    });

    it('says it is looking while it reads the subscriptions', async () => {
      let release: (() => void) | undefined;
      server.use(
        handleGetInstances(async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });

          return HttpResponse.json(pageOf(INSTANCES));
        }),
      );
      renderDialog();

      await userEvent.click(await confirm());

      expect(await screen.findByText('Looking for the instances concerned…')).toBeInTheDocument();
      await vi.waitFor(() => expect(release).toBeDefined());
      release?.();
      await screen.findByTestId('plan-change-instances');
      expect(screen.queryByText('Looking for the instances concerned…')).toBeNull();
    });

    it('says nothing more when no instance is found: the refusal stands as it is', async () => {
      server.use(handleGetInstances({ body: pageOf([INSTANCES[2], INSTANCES[4]]) }));
      renderDialog();

      await userEvent.click(await confirm());

      await screen.findByRole('alert');
      await waitFor(() => expect(screen.queryByText('Looking for the instances concerned…')).toBeNull());
      expect(screen.queryByTestId('plan-change-instances')).toBeNull();
    });

    it('says nothing more when the instances cannot be read: the search is a help, not part of the refusal', async () => {
      server.use(handleGetInstances(() => refusal(500, { detail: 'boom' })));
      renderDialog();

      await userEvent.click(await confirm());

      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(screen.queryByText('Looking for the instances concerned…')).toBeNull());
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(alert).toHaveTextContent('a plan change is scheduled to this price');
      expect(screen.queryByTestId('plan-change-instances')).toBeNull();
    });

    it('does not look for them at all when the session may not read subscriptions', async () => {
      getAuthToken.mockResolvedValue(sessionToken(['write:licenses', 'read:licenses']));
      let looked = 0;
      server.use(
        handleGetInstances(() => {
          looked += 1;

          return HttpResponse.json(pageOf(INSTANCES));
        }),
      );
      renderDialog();

      await userEvent.click(await confirm());

      await screen.findByRole('alert');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(looked).toBe(0);
      expect(screen.queryByTestId('plan-change-instances')).toBeNull();
    });
  });
});
