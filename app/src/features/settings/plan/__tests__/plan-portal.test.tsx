import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { planHandlers } from '@/e2e/msw/plan-handlers';
import { renderWithClient } from '@/test-fixtures/billing-test-support';
import { buildKaitenCloudPortal } from '../../../../../e2e/app/_support/fixtures/build-kaiten-cloud-plan';
import { PlanAppModel } from '../../../../../e2e/app/_support/model/plan-app-model';
import { PlanPageContent } from '../components';

// The page names the Kaiten Cloud the mocks stand for: the unit environment names none.
vi.mock('@/env', () => ({
  default: {
    API_URL: 'http://api.test/api',
    PLATFORM_API_URL: 'https://kaiten-cloud.test/api',
    PLATFORM_FLAGS_TOKEN: '',
    PLATFORM_PUBLISHABLE_KEY: 'pk_mockKaitenCloudConsolePlanAndUsageCatalogue',
  },
}));

const CLOUD = {
  apiUrl: 'https://kaiten-cloud.test/api',
  publishableKey: 'pk_mockKaitenCloudConsolePlanAndUsageCatalogue',
};

/** The page, on a Kaiten Cloud served by the model the app suite uses. */
const page = (model = new PlanAppModel()) => {
  server.use(...planHandlers(model, undefined, CLOUD));
  return renderWithClient(<PlanPageContent onSelectPlan={vi.fn()} />);
};

/** The SDK's usage block, once the portal is read: titled by the plan it names. */
const usageBlock = async () => {
  const title = await screen.findByRole('heading', {
    level: 2,
    name: 'Cloud Starter',
  });

  return title.closest('[data-slot="license-usage"]') as HTMLElement;
};

const rowOf = (usage: HTMLElement, name: string) =>
  within(usage)
    .getByText(name)
    .closest('[data-slot="license-usage-quota"]') as HTMLElement;

// The SDK writes figures and dates in the runtime's locale, not the console's, so the test
// writes what it expects the same way: it reads the same on a machine set to any locale.
const figures = (used: number, limit: number) =>
  `${used.toLocaleString()} / ${limit.toLocaleString()}`;

/**
 * A text as Testing Library reads the page's: each run of white space as one space. Some
 * locales group digits with a no-break space, which the page's text loses and an accessible
 * name keeps.
 */
const asRead = (text: string) => text.replace(/\s+/g, ' ');

/** The day of a window bound, as the SDK's date of it starts: in UTC, where Kaiten sets it. */
const day = (bound: string) =>
  asRead(
    new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(bound)),
  );

const inOrder = (...parts: string[]) =>
  new RegExp(
    parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'),
  );

// The portal of the organization's plan is the SDK's, but what it has used is not the
// portal's meters: they draw the quotas something caps and leave the unlimited ones out, and
// Kaiten's own plans leave most of what they grant unlimited. The page draws the SDK's usage
// block in their place, from the same portal the rest of the page reads.
describe('PlanPageContent, with a session', () => {
  it('draws every numeric quota of the plan with what is used, the unlimited ones included', async () => {
    page();

    const usage = await usageBlock();
    const rows = within(
      within(usage).getByRole('list', { name: 'Usage' }),
    ).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Managed customers',
      'Instances',
      'Webhook events',
      'Console users',
    ]);

    // Something caps it: its figures, the share used and a bar that says where it stands.
    const customers = rowOf(usage, 'Managed customers');
    expect(within(customers).getByText('9 / 25')).toBeInTheDocument();
    expect(within(customers).getByText('36%')).toBeInTheDocument();
    expect(
      within(customers).getByRole('progressbar', {
        name: 'Managed customers: 9 / 25',
      }),
    ).toHaveAttribute('data-usage-state', 'healthy');
    // It resets each month: the window it counts over is said, and 87% is a look away.
    const webhooks = rowOf(usage, 'Webhook events');
    expect(
      within(webhooks).getByText(asRead(figures(870, 1000))),
    ).toBeInTheDocument();
    expect(webhooks).toHaveTextContent(
      inOrder(day('2026-11-01T00:00:00Z'), day('2026-12-01T00:00:00Z')),
    );
    expect(
      within(webhooks).getByRole('progressbar', {
        name: `Webhook events: ${figures(870, 1000)}`,
      }),
    ).toHaveAttribute('data-usage-state', 'near_limit');
    // Nothing caps it: what is used out of "Unlimited", and nothing to fill.
    for (const [name, figures] of [
      ['Instances', '14 / Unlimited'],
      ['Console users', '4 / Unlimited'],
    ]) {
      const row = rowOf(usage, name);
      expect(within(row).getByText(figures)).toBeInTheDocument();
      expect(within(row).queryByRole('progressbar')).toBeNull();
      expect(row).not.toHaveTextContent('%');
    }
  });

  it('draws no meters of the portal, and keeps its other sections around the usage', async () => {
    page();

    const usage = await usageBlock();
    // The meters have a card of their own, titled by the SDK; the quotas are drawn once.
    expect(screen.queryByText('Usage meters')).toBeNull();
    expect(screen.getAllByText('9 / 25')).toHaveLength(1);
    // What the plan includes, then what it has used, then how it is paid.
    const before = (earlier: Element, later: Element) =>
      Boolean(
        earlier.compareDocumentPosition(later) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    const plan = await screen.findByText('Current plan');
    const features = await screen.findByText('Included features');
    const payment = await screen.findByText('Payment method');
    const voucher = await screen.findByText('Voucher');
    const invoices = await screen.findByText('Invoices');
    expect(before(plan, features)).toBe(true);
    expect(before(features, usage)).toBe(true);
    expect(before(usage, payment)).toBe(true);
    expect(before(payment, voucher)).toBe(true);
    expect(before(voucher, invoices)).toBe(true);
  });

  it('reads the portal once for the plan, its usage and its payment', async () => {
    const model = new PlanAppModel();
    const read = vi.spyOn(model, 'getPortal');
    page(model);

    await usageBlock();
    await screen.findByText('Visa •••• 4242');

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('says a usage that could not be read is not read, and does not claim that nothing was used', async () => {
    const portal = buildKaitenCloudPortal();
    portal.entitlements = portal.entitlements.map((entitlement) =>
      entitlement.slug === 'customers'
        ? { ...entitlement, currentValue: null, percentageUsed: null }
        : entitlement,
    );
    page(new PlanAppModel({ portal }));

    const customers = rowOf(await usageBlock(), 'Managed customers');

    expect(within(customers).getByText('Usage unavailable')).toBeInTheDocument();
    expect(within(customers).queryByRole('progressbar')).toBeNull();
    expect(customers).not.toHaveTextContent('0 / 25');
    expect(customers).not.toHaveTextContent('%');
  });

  it('says a portal that cannot be read once, whatever the parts that read it, and draws it on "Try again"', async () => {
    const model = new PlanAppModel();
    model.armProblem('getSessionPortal', {
      detail: 'the portal is not served here',
      status: 404,
    });
    page(model);

    // The plan, its usage and its payment are three parts of one read: one card, not three.
    expect(await screen.findAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Cloud Starter' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await usageBlock();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
